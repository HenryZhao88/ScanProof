"""The domain-shift study: does ScanProof detect the failure that actually happens?

    python -m scanproof.shift

Motivation
----------
The in-distribution audit (``scanproof.evaluate``) produced an honest negative
result: on chest films the model was trained for, calibrated confidence ranks
errors slightly *better* than the composite reliability score. If that were the
whole story, ScanProof would not be worth shipping.

But confidence answers "how far is this input from my decision boundary". It
cannot answer "have I ever seen anything like this input", because a two-class
softmax is normalised over the two classes it knows and nothing else. The
failure that ends real deployments is not a borderline case — it is a model
trained at one institution being run on another institution's patients, staying
just as confident while its accuracy collapses.

This module measures exactly that, on four arms of increasing distance from
the training distribution:

  1. in_distribution     PneumoniaMNIST test, native 224   (pediatric, Guangzhou)
  2. resolution_control  PneumoniaMNIST test, 128 -> 224   (same films, shift-set resampling)
  3. domain_shift        ChestMNIST test, 128 -> 224       (ADULT, NIH Clinical Center)
  4. wrong_modality      BreastMNIST test, native 224      (breast ultrasound)

Arm 2 exists to kill the obvious confound. The shift set is only available at
128 without downloading a 3.7 GB archive, so arm 2 puts the *pediatric* films
through the identical 128 -> 224 path. If arms 1 and 2 agree, resolution is not
driving the result and arm 3 isolates the change in input population.

What this arm can and cannot measure
------------------------------------
PneumoniaMNIST and ChestX-ray14 do NOT share a label definition: the first is
expert-graded pediatric pneumonia, the second an NLP-mined mention of
pneumonia in an adult report with a "nothing mentioned" negative class. So the
accuracy figure on arm 3 conflates population shift, label-definition shift and
label noise. It is reported for completeness and is not what the study rests on.

The load-bearing measurements are label-free: the model's own confidence, the
embedding percentile, and the verdict that follows from them. Those are
properties of the input and the model, and need no ground truth.

Headline metric
---------------
Treat "is this input from a population the model was not trained on?" as a
detection problem and score it with one scalar at a time. A signal that carries
no shift information lands at AUROC 0.5.

Nothing here touches the PneumoniaMNIST validation split or re-tunes any
threshold. The thresholds were frozen by ``scanproof.evaluate`` before this ran.
"""

from __future__ import annotations

import json
import time

import numpy as np

from .config import ARTIFACT_DIR, CLASS_NAMES, OOD_PROBE_DATASET
from .data import (
    load_domain_shift_set,
    load_resolution_control,
    load_split,
)
from .perturbations import N_VARIANTS
from .pipeline import Analyzer
from .reliability import BLOCK, PASS, REVIEW, ReliabilityResult, assess

BANDS = (PASS, REVIEW, BLOCK)


def _progress(tag: str):
    t0 = time.time()

    def cb(done: int, total: int):
        if done == total or done % 200 == 0:
            print(f"  [{tag}] {done}/{total}  ({time.time() - t0:.0f}s)", flush=True)

    return cb


def _auroc(score: np.ndarray, positive: np.ndarray) -> float:
    from sklearn.metrics import roc_auc_score

    if len(np.unique(positive)) < 2:
        return float("nan")
    return float(roc_auc_score(positive, score))


def _mean_ci(x: np.ndarray, n_boot: int = 2000, seed: int = 3) -> dict:
    """Bootstrap 95% CI on the mean. Arm sizes here are a few hundred, so a
    point estimate alone would overstate precision."""
    x = np.asarray(x, dtype=np.float64)
    rng = np.random.default_rng(seed)
    boots = rng.choice(x, size=(n_boot, len(x)), replace=True).mean(axis=1)
    return {
        "mean": round(float(x.mean()), 4),
        "ci_low": round(float(np.quantile(boots, 0.025)), 4),
        "ci_high": round(float(np.quantile(boots, 0.975)), 4),
    }


def summarise_arm(
    name: str,
    label: str,
    description: str,
    results: list[ReliabilityResult],
    labels: np.ndarray | None,
) -> dict:
    conf = np.array([r.confidence for r in results])
    score = np.array([r.reliability_score for r in results])
    verdicts = np.array([r.verdict for r in results])
    ood = np.array([r.ood_detail["percentile"] for r in results])
    flips = np.array([r.perturbation_summary["n_flips"] for r in results])
    std = np.array([r.ensemble_detail["std"] for r in results])

    sub_means = {}
    for key in ("confidence", "stability", "agreement", "typicality"):
        vals = np.array([next(s.value for s in r.subscores if s.key == key) for r in results])
        sub_means[key] = round(float(vals.mean()), 4)

    arm: dict = {
        "name": name,
        "label": label,
        "description": description,
        "n": int(len(results)),
        "model_confidence": _mean_ci(conf),
        "confidence_ge_090": round(float((conf >= 0.90).mean()), 4),
        "reliability_score": _mean_ci(score),
        "verdicts": {
            b: {"n": int((verdicts == b).sum()), "share": round(float((verdicts == b).mean()), 4)}
            for b in BANDS
        },
        "mean_subscores": sub_means,
        "mean_ood_percentile": round(float(ood.mean()), 4),
        "mean_flips_of_21": round(float(flips.mean()), 3),
        "flip_rate": round(float(flips.mean() / N_VARIANTS), 4),
        "mean_ensemble_std": round(float(std.mean()), 4),
    }

    if labels is not None:
        y = np.asarray(labels).reshape(-1)
        pred = np.array([r.predicted_index for r in results])
        correct = pred == y
        arm["accuracy"] = _mean_ci(correct.astype(np.float64))
        arm["auroc"] = round(_auroc(np.array([r.prob_pneumonia for r in results]), y), 4)
        arm["positive_rate"] = round(float(y.mean()), 4)
        # selective accuracy: does the verdict still carry information here?
        arm["accuracy_by_band"] = {}
        for b in BANDS:
            m = verdicts == b
            arm["accuracy_by_band"][b] = {
                "n": int(m.sum()),
                "accuracy": round(float(correct[m].mean()), 4) if m.any() else None,
            }
    return arm


def detection_table(
    reference: list[ReliabilityResult], shifted: list[ReliabilityResult]
) -> list[dict]:
    """How well does each single scalar separate 'trained for this' from 'not'?

    Every signal is oriented so that higher = more suspicious. AUROC 0.5 means
    the signal carries no information about shift; below 0.5 means it points the
    wrong way — the model is *more* comfortable on data it has never seen.
    """
    y = np.concatenate([np.zeros(len(reference)), np.ones(len(shifted))])
    both = reference + shifted

    order = {PASS: 0, REVIEW: 1, BLOCK: 2}
    signals = {
        "Model confidence (1 − p)": np.array([1.0 - r.confidence for r in both]),
        "Ensemble disagreement (σ)": np.array([r.ensemble_detail["std"] for r in both]),
        "Perturbation instability": np.array(
            [r.perturbation_summary["mean_abs_delta"] for r in both]
        ),
        "Embedding percentile": np.array([r.ood_detail["percentile"] for r in both]),
        "ScanProof reliability (100 − s)": np.array(
            [100.0 - r.reliability_score for r in both]
        ),
        # What the system actually emits. The continuous score understates it
        # because the hard OOD gate is a discontinuity the score cannot express.
        "ScanProof verdict (operational)": np.array([order[r.verdict] for r in both]),
    }
    rows = [
        {
            "signal": k,
            "auroc": round(_auroc(v, y), 4),
            # exactly one row is the continuous composite; the verdict row is the
            # same system after thresholding and is flagged separately
            "is_composite": k.startswith("ScanProof reliability"),
            "is_operational": k.startswith("ScanProof verdict"),
        }
        for k, v in signals.items()
    ]
    rows.sort(key=lambda r: -r["auroc"])
    return rows


#: Every scalar the system could use as its single "should I trust this?" number,
#: oriented so that higher = more suspicious.
def _signal_vector(results: list[ReliabilityResult]) -> dict[str, np.ndarray]:
    return {
        "Model confidence": np.array([1.0 - r.confidence for r in results]),
        "Ensemble disagreement": np.array([r.ensemble_detail["std"] for r in results]),
        "Perturbation instability": np.array(
            [r.perturbation_summary["mean_abs_delta"] for r in results]
        ),
        "Embedding percentile": np.array([r.ood_detail["percentile"] for r in results]),
        "ScanProof composite": np.array([100.0 - r.reliability_score for r in results]),
    }


def two_regime_table(
    in_dist: list[ReliabilityResult],
    in_labels: np.ndarray,
    reference: list[ReliabilityResult],
    shifted: list[ReliabilityResult],
) -> dict:
    """The central result.

    A deployed system gets **one** number to decide whether to trust a
    prediction. Two different things can go wrong, and they are not the same
    problem:

      Regime A — the input is in-distribution but the case is genuinely hard.
                 Measured as selective-prediction AURC over the test split
                 (lower is better).
      Regime B — the input is not from the training distribution at all.
                 Measured as detection AUROC, pediatric vs adult films
                 (higher is better).

    Each signal is scored in both regimes. The question is not which signal wins
    a regime, but whether any single signal is acceptable in both.
    """
    from .evaluate import _selective_curve

    y = np.asarray(in_labels).reshape(-1)
    correct = np.array([r.predicted_index == int(t) for r, t in zip(in_dist, y)])

    detect_y = np.concatenate([np.zeros(len(reference)), np.ones(len(shifted))])
    detect_signals = _signal_vector(reference + shifted)
    rank_signals = _signal_vector(in_dist)

    rows = []
    for name in rank_signals:
        # regime A: rank by *trustworthiness*, i.e. negate the suspicion score
        aurc = _selective_curve(-rank_signals[name], correct)["aurc"]
        auroc = _auroc(detect_signals[name], detect_y)
        rows.append(
            {
                "signal": name,
                "in_distribution_aurc": round(aurc, 4),
                "shift_detection_auroc": round(auroc, 4),
                "is_composite": name == "ScanProof composite",
            }
        )

    best_aurc = min(r["in_distribution_aurc"] for r in rows)
    worst_aurc = max(r["in_distribution_aurc"] for r in rows)
    best_auroc = max(r["shift_detection_auroc"] for r in rows)
    worst_auroc = min(r["shift_detection_auroc"] for r in rows)

    for r in rows:
        # Thresholded view. These margins were fixed before the study ran and
        # are NOT relaxed to fit the outcome: as measured, nothing clears both.
        r["good_in_distribution"] = bool(r["in_distribution_aurc"] <= best_aurc + 0.01)
        r["good_under_shift"] = bool(r["shift_detection_auroc"] >= best_auroc - 0.05)
        r["good_in_both"] = bool(r["good_in_distribution"] and r["good_under_shift"])

        # Threshold-free view. Rescale each regime so the best signal scores 1
        # and the worst scores 0, then take the worse of a signal's two scores.
        # Maximising that minimum is the standard way to pick when you must
        # commit to one number and cannot know which failure mode you will meet.
        na = (worst_aurc - r["in_distribution_aurc"]) / max(worst_aurc - best_aurc, 1e-12)
        nb = (r["shift_detection_auroc"] - worst_auroc) / max(best_auroc - worst_auroc, 1e-12)
        r["normalised_in_distribution"] = round(float(na), 4)
        r["normalised_shift"] = round(float(nb), 4)
        r["worst_case"] = round(float(min(na, nb)), 4)

    # Pareto: is any signal better than this one on *both* axes?
    for r in rows:
        r["dominated_by"] = [
            o["signal"]
            for o in rows
            if o is not r
            and o["in_distribution_aurc"] <= r["in_distribution_aurc"]
            and o["shift_detection_auroc"] >= r["shift_detection_auroc"]
            and (
                o["in_distribution_aurc"] < r["in_distribution_aurc"]
                or o["shift_detection_auroc"] > r["shift_detection_auroc"]
            )
        ]
        r["pareto_optimal"] = not r["dominated_by"]

    best_compromise = max(rows, key=lambda r: r["worst_case"])

    return {
        "note": (
            "Regime A is selective-prediction AURC on the 624-image pediatric test split "
            "(lower is better). Regime B is detection AUROC separating pediatric from adult "
            "films (higher is better; 0.5 is chance)."
        ),
        "threshold_note": (
            "'Acceptable' means within 0.01 AURC of the best signal in regime A and within "
            "0.05 AUROC of the best in regime B. These margins were set before the study ran. "
            "As measured, no signal clears both — reported as found rather than relaxed."
        ),
        "worst_case_note": (
            "worst_case rescales each regime so the best signal is 1 and the worst is 0, then "
            "takes the lower of a signal's two scores. It answers the question a deployed "
            "system actually faces: you must commit to one number without knowing which "
            "failure mode arrives next, so the sensible choice maximises the worst case."
        ),
        "best_in_distribution_aurc": round(best_aurc, 4),
        "best_shift_auroc": round(best_auroc, 4),
        "rows": rows,
        "signals_good_in_both": [r["signal"] for r in rows if r["good_in_both"]],
        "best_compromise": {
            "signal": best_compromise["signal"],
            "worst_case": best_compromise["worst_case"],
            "runner_up": sorted(rows, key=lambda r: -r["worst_case"])[1]["signal"],
            "runner_up_worst_case": sorted(rows, key=lambda r: -r["worst_case"])[1]["worst_case"],
        },
        "pareto_frontier": [r["signal"] for r in rows if r["pareto_optimal"]],
    }


def main() -> None:
    print("loading models…", flush=True)
    analyzer = Analyzer()
    names = analyzer.member_names

    def run(imgs: np.ndarray, tag: str) -> list[ReliabilityResult]:
        print(f"measuring {tag} ({len(imgs)} images)…", flush=True)
        ms = analyzer.measure_batch(imgs, progress=_progress(tag))
        return [assess(m.bundle(names), analyzer.config) for m in ms]

    # ---- arm 1: in-distribution, native resolution -----------------------
    ind_imgs, ind_labels = load_split("test")
    ind = run(ind_imgs, "in-dist")

    # ---- arm 2: same films, shift-set resampling (the confound control) --
    ctrl_imgs, ctrl_labels = load_resolution_control()
    ctrl = run(ctrl_imgs, "res-ctrl")

    # ---- arm 3: adult films from a different institution -----------------
    shift_imgs, shift_labels, shift_meta = load_domain_shift_set()
    shift = run(shift_imgs, "adult-shift")

    # ---- arm 4: wrong modality entirely ----------------------------------
    ood_imgs, _ = load_split("test", flag=OOD_PROBE_DATASET)
    ood = run(ood_imgs, "ultrasound")

    arms = [
        summarise_arm(
            "in_distribution",
            "Pediatric · trained distribution",
            "PneumoniaMNIST test split at native 224. The population the ensemble was fine-tuned on.",
            ind,
            ind_labels,
        ),
        summarise_arm(
            "resolution_control",
            "Pediatric · shift-set resampling",
            "The same films, resampled 128 → 224 exactly as the adult arm is. Isolates resolution from population.",
            ctrl,
            ctrl_labels,
        ),
        summarise_arm(
            "domain_shift",
            "Adult · different source collection",
            "ChestMNIST (NIH ChestX-ray14), balanced. Frontal chest radiographs like the "
            "training data, but different patients, institution and country — and a different "
            "label definition, so its accuracy is not a like-for-like comparison.",
            shift,
            shift_labels,
        ),
        summarise_arm(
            "wrong_modality",
            "Breast ultrasound",
            "Not a chest radiograph at all. The extreme end of the spectrum.",
            ood,
            None,
        ),
    ]

    # ---- the resolution control has to hold for arm 3 to mean anything ---
    a1, a2 = arms[0], arms[1]
    control = {
        "purpose": (
            "The adult set is only available at 128 without a 3.7 GB download, so it is "
            "resampled to 224. This arm applies that same resampling to the pediatric films. "
            "If it tracks the native arm, resolution is not what the study is measuring."
        ),
        "accuracy_delta": round(a2["accuracy"]["mean"] - a1["accuracy"]["mean"], 4),
        "confidence_delta": round(
            a2["model_confidence"]["mean"] - a1["model_confidence"]["mean"], 4
        ),
        "pass_rate_delta": round(a2["verdicts"][PASS]["share"] - a1["verdicts"][PASS]["share"], 4),
        "ood_percentile_delta": round(a2["mean_ood_percentile"] - a1["mean_ood_percentile"], 4),
    }
    control["verdict"] = (
        "resolution accounts for the effect — arm 3 is not interpretable"
        if abs(control["pass_rate_delta"]) > 0.20
        else "resolution effect is small relative to the domain effect"
    )

    # ---- headline: detection of shift from a single scalar ---------------
    detection = {
        "task": (
            "Separate the pediatric films the model was trained on from adult films of the "
            "same modality taken at a different institution, using one scalar. Every signal is "
            "oriented so higher = more suspicious; 0.5 is chance."
        ),
        "reference_arm": "resolution_control",
        "reference_n": len(ctrl),
        "shifted_arm": "domain_shift",
        "shifted_n": len(shift),
        "signals": detection_table(ctrl, shift),
    }

    conf_row = next(r for r in detection["signals"] if r["signal"].startswith("Model confidence"))
    comp_row = next(r for r in detection["signals"] if r["is_composite"])

    two_regime = two_regime_table(ind, ind_labels, ctrl, shift)

    summary = {
        "generated_by": "python -m scanproof.shift",
        "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "question": (
            "Confidence ranks errors well inside the training distribution. Does it also tell "
            "you when the input is no longer from that distribution?"
        ),
        "accuracy_caveat": (
            "Accuracy on the adult arm is NOT a like-for-like comparison: the two datasets do "
            "not share a label definition. It is reported for completeness. The claims this "
            "study rests on are label-free — confidence, embedding percentile, and verdict."
        ),
        "answer": {
            "confidence_detection_auroc": conf_row["auroc"],
            "scanproof_detection_auroc": comp_row["auroc"],
            "pediatric_pass_rate": a2["verdicts"][PASS]["share"],
            "adult_pass_rate": arms[2]["verdicts"][PASS]["share"],
            "pediatric_confidence": a2["model_confidence"]["mean"],
            "adult_confidence": arms[2]["model_confidence"]["mean"],
            "pediatric_accuracy": a2["accuracy"]["mean"],
            "adult_accuracy": arms[2]["accuracy"]["mean"],
        },
        "arms": arms,
        "resolution_control": control,
        "detection": detection,
        "two_regime": two_regime,
        "shift_set": shift_meta,
        "thresholds": {
            "pass": analyzer.config.pass_threshold,
            "review": analyzer.config.review_threshold,
            "source": analyzer.config.source,
            "note": "frozen by scanproof.evaluate on the pediatric validation split before this study ran",
        },
        "disclaimer": (
            "Research prototype. This is a retrospective study on public de-identified benchmark "
            "data. It is not a clinical validation and makes no claim about patient safety."
        ),
    }

    path = ARTIFACT_DIR / "shift_study.json"
    path.write_text(json.dumps(summary, indent=2))

    # Per-case rows for the adult arm so `scanproof.demo` can pick real shifted
    # films for the deck without re-running the battery. Git-ignored; rebuilt by
    # this script.
    (ARTIFACT_DIR / "shift_cases.json").write_text(
        json.dumps(
            {
                "arm": "domain_shift",
                "source": shift_meta["source"],
                "cases": [
                    {
                        "position": i,
                        "true_class": CLASS_NAMES[int(t)],
                        "predicted_class": r.predicted_class,
                        "correct": bool(r.predicted_index == int(t)),
                        "confidence": round(r.confidence, 4),
                        "reliability_score": round(r.reliability_score, 1),
                        "verdict": r.verdict,
                        "ood_percentile": r.ood_detail["percentile"],
                        "n_flips": r.perturbation_summary["n_flips"],
                    }
                    for i, (r, t) in enumerate(zip(shift, shift_labels))
                ],
            },
            indent=2,
        )
    )

    # ---- console report --------------------------------------------------
    print("\n" + "=" * 78)
    print(f"{'arm':<34}{'n':>6}{'acc':>9}{'conf':>9}{'PASS':>9}{'OOD pct':>10}")
    print("-" * 78)
    for a in arms:
        acc = f"{a['accuracy']['mean']:.3f}" if "accuracy" in a else "   —"
        print(f"{a['label']:<34}{a['n']:>6}{acc:>9}"
              f"{a['model_confidence']['mean']:>9.3f}"
              f"{a['verdicts'][PASS]['share'] * 100:>8.1f}%"
              f"{a['mean_ood_percentile'] * 100:>9.1f}")
    print("=" * 78)
    print(f"\nresolution control: {control['verdict']}")
    print(f"  (pediatric native vs resampled — PASS Δ {control['pass_rate_delta']:+.3f}, "
          f"accuracy Δ {control['accuracy_delta']:+.3f})")
    print("\n" + "=" * 78)
    print("TWO-REGIME TABLE — can any single signal handle both failure modes?")
    print("-" * 78)
    print(f"{'signal':<28}{'in-dist AURC ↓':>16}{'shift AUROC ↑':>16}{'good in both':>16}")
    for r in two_regime["rows"]:
        mark = "yes" if r["good_in_both"] else "no"
        print(f"{r['signal']:<28}{r['in_distribution_aurc']:>16.4f}"
              f"{r['shift_detection_auroc']:>16.4f}{mark:>16}")
    print("=" * 78)
    print(f"acceptable in both under the pre-set margins: "
          f"{two_regime['signals_good_in_both'] or 'NONE — reported as found'}")
    bc = two_regime["best_compromise"]
    print(f"best worst-case across regimes: {bc['signal']} ({bc['worst_case']:.3f}), "
          f"next {bc['runner_up']} ({bc['runner_up_worst_case']:.3f})")
    print(f"pareto frontier: {', '.join(two_regime['pareto_frontier'])}")
    print("\nshift detection AUROC by signal (0.5 = no information):")
    for r in detection["signals"]:
        print(f"  {r['signal']:<36}{r['auroc']:.4f}")
    print(f"\nwrote {path}")


if __name__ == "__main__":
    main()
