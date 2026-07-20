"""Offline audit: select thresholds on validation, then measure on test.

    python -m scanproof.evaluate

Two-stage, deliberately:

1. **Validation split (524 images)** — run the full reliability pipeline, then
   search for the PASS/REVIEW thresholds that make the PASS band reach a target
   selective accuracy at maximum coverage. Written to
   ``artifacts/reliability_config.json``.

2. **Test split (624 images)** — re-score with the frozen thresholds and report.
   The test split is never used to choose anything, so the numbers in the audit
   view are honest held-out estimates.

Outputs
  artifacts/reliability_config.json  thresholds + the evidence for them (committed)
  artifacts/audit_summary.json       every number the audit UI displays (committed)
  artifacts/audit_cases.json         per-case rows (git-ignored, regenerate with this script)
"""

from __future__ import annotations

import json
import time
from collections import defaultdict

import numpy as np

from .calibration import brier_score, expected_calibration_error, negative_log_likelihood
from .config import (
    ARTIFACT_DIR,
    BLOCK_BUDGET,
    CLASS_NAMES,
    MAX_PASS_COVERAGE,
    OOD_PROBE_DATASET,
    PASS_TARGET_ACCURACY,
    WEIGHTS,
    ReliabilityConfig,
)
from .data import dataset_metadata, load_split, to_model_tensor
from .models import member_features
from .perturbations import FAMILY_BY_KEY, SEVERITIES, family_catalogue
from .pipeline import Analyzer
from .reliability import BLOCK, PASS, REVIEW, ReliabilityResult, assess, decide_verdict

BANDS = (PASS, REVIEW, BLOCK)
MIN_PASS_COVERAGE = 0.25


def _progress(tag: str):
    t0 = time.time()

    def cb(done: int, total: int):
        if done == total or done % 160 == 0:
            print(f"  [{tag}] {done}/{total}  ({time.time() - t0:.0f}s)", flush=True)

    return cb


# ------------------------------------------------------------------ metrics


def _auroc(scores: np.ndarray, labels: np.ndarray) -> float:
    from sklearn.metrics import roc_auc_score

    if len(np.unique(labels)) < 2:
        return float("nan")
    return float(roc_auc_score(labels, scores))


def _classification_metrics(probs: np.ndarray, labels: np.ndarray) -> dict:
    pred = probs.argmax(1)
    tp = int(((pred == 1) & (labels == 1)).sum())
    tn = int(((pred == 0) & (labels == 0)).sum())
    fp = int(((pred == 1) & (labels == 0)).sum())
    fn = int(((pred == 0) & (labels == 1)).sum())
    sens = tp / (tp + fn) if tp + fn else float("nan")
    spec = tn / (tn + fp) if tn + fp else float("nan")
    return {
        "n": int(len(labels)),
        "accuracy": round(float((pred == labels).mean()), 4),
        "balanced_accuracy": round(float((sens + spec) / 2), 4),
        "auroc": round(_auroc(probs[:, 1], labels), 4),
        "sensitivity": round(sens, 4),
        "specificity": round(spec, 4),
        "confusion": {"tp": tp, "tn": tn, "fp": fp, "fn": fn},
    }


def _selective_curve(rank_by: np.ndarray, correct: np.ndarray, steps: int = 20) -> dict:
    """Risk–coverage curve: sort by `rank_by` descending (higher = keep first),
    then report accuracy over the retained top fraction.

    AURC is the area under the *risk* (error-rate) curve — lower is better. A
    ranking signal that puts the model's errors at the bottom gets a low AURC.
    """
    order = np.argsort(-rank_by, kind="stable")
    ordered = correct[order].astype(np.float64)
    cum = np.cumsum(ordered)
    n = len(ordered)

    points = []
    for i in range(1, steps + 1):
        k = max(1, int(round(n * i / steps)))
        points.append(
            {
                "coverage": round(k / n, 4),
                "accuracy": round(float(cum[k - 1] / k), 4),
                "risk": round(float(1 - cum[k - 1] / k), 4),
                "n_retained": k,
            }
        )
    risks = (1 - cum / np.arange(1, n + 1)).astype(np.float64)
    return {"points": points, "aurc": round(float(risks.mean()), 4)}


# ------------------------------------------------- threshold selection (val)


def select_thresholds(results: list[ReliabilityResult], labels: np.ndarray) -> dict:
    """Pick PASS/REVIEW thresholds on the validation split.

    REVIEW threshold: the score quantile that puts BLOCK_BUDGET of validation
    into BLOCK, i.e. we reserve a fixed, small budget for hard refusals.

    PASS threshold: the stricter of two rules —
      * accuracy guard: the lowest score whose PASS band reaches
        PASS_TARGET_ACCURACY (with gates applied), and
      * coverage cap: the score quantile that keeps PASS at or below
        MAX_PASS_COVERAGE.

    The cap is load-bearing. The ensemble scores ~98% on this in-distribution
    split, so an accuracy target alone is satisfied by passing everything and
    the verdict stops discriminating. Reserving a fixed share of validation for
    REVIEW/BLOCK is the standard selective-prediction answer to a split the
    model has nearly saturated.
    """
    scores = np.array([r.reliability_score for r in results])
    correct = np.array(
        [r.predicted_index == int(y) for r, y in zip(results, labels)], dtype=bool
    )
    gate_inputs = [r.gate_inputs for r in results]

    review_t = float(np.quantile(scores, BLOCK_BUDGET))
    coverage_floor = float(np.quantile(scores, 1.0 - MAX_PASS_COVERAGE))

    candidates = np.unique(np.round(scores, 2))
    candidates = candidates[(candidates > review_t) & (candidates >= coverage_floor)]
    trace, best, fallback = [], None, None

    for t in candidates:
        cfg = ReliabilityConfig(pass_threshold=float(t), review_threshold=review_t)
        verdicts = np.array([decide_verdict(s, gi, cfg)[0] for s, gi in zip(scores, gate_inputs)])
        mask = verdicts == PASS
        cov = float(mask.mean())
        if cov == 0:
            continue
        acc = float(correct[mask].mean())
        trace.append({"pass_threshold": round(float(t), 2), "coverage": round(cov, 4),
                      "accuracy": round(acc, 4)})
        if acc >= PASS_TARGET_ACCURACY and cov >= MIN_PASS_COVERAGE and best is None:
            best = {"pass_threshold": float(t), "coverage": cov, "accuracy": acc}
        if cov >= MIN_PASS_COVERAGE and (fallback is None or acc > fallback["accuracy"]):
            fallback = {"pass_threshold": float(t), "coverage": cov, "accuracy": acc}

    chosen = best or fallback
    if chosen is None:  # degenerate; keep the configured defaults
        cfg = ReliabilityConfig()
        chosen = {"pass_threshold": cfg.pass_threshold, "coverage": None, "accuracy": None}
        met = False
    else:
        met = best is not None

    return {
        "pass_threshold": round(chosen["pass_threshold"], 2),
        "review_threshold": round(review_t, 2),
        "weights": dict(WEIGHTS),
        "ood_hard_pct": ReliabilityConfig().ood_hard_pct,
        "source": "selected on the validation split by python -m scanproof.evaluate",
        "selection": {
            "target_pass_accuracy": PASS_TARGET_ACCURACY,
            "target_met": met,
            "block_budget": BLOCK_BUDGET,
            "max_pass_coverage": MAX_PASS_COVERAGE,
            "min_pass_coverage": MIN_PASS_COVERAGE,
            "coverage_floor_score": round(coverage_floor, 2),
            "val_pass_coverage": round(chosen["coverage"], 4) if chosen["coverage"] else None,
            "val_pass_accuracy": round(chosen["accuracy"], 4) if chosen["accuracy"] else None,
            "rule": (
                "PASS threshold = stricter of (a) the lowest score whose validation PASS band "
                "reaches target_pass_accuracy and (b) the score quantile capping PASS coverage "
                "at max_pass_coverage. REVIEW threshold = the block_budget score quantile."
            ),
            "sweep": trace[:: max(1, len(trace) // 60)],
        },
    }


# ------------------------------------------------------------------- report


def band_report(results: list[ReliabilityResult], labels: np.ndarray) -> list[dict]:
    verdicts = np.array([r.verdict for r in results])
    probs = np.stack([[1 - r.prob_pneumonia, r.prob_pneumonia] for r in results])
    correct = np.array([r.predicted_index == int(y) for r, y in zip(results, labels)])
    total_errors = int((~correct).sum())

    rows = []
    for band in BANDS:
        mask = verdicts == band
        n = int(mask.sum())
        row = {
            "band": band,
            "n": n,
            "coverage": round(float(mask.mean()), 4),
            "accuracy": round(float(correct[mask].mean()), 4) if n else None,
            "mean_reliability_score": round(
                float(np.mean([r.reliability_score for r, m in zip(results, mask) if m])), 2
            ) if n else None,
            "mean_confidence": round(
                float(np.mean([r.confidence for r, m in zip(results, mask) if m])), 4
            ) if n else None,
            "errors": int((~correct[mask]).sum()) if n else 0,
            "share_of_all_errors": round(
                float((~correct[mask]).sum() / total_errors), 4
            ) if n and total_errors else 0.0,
        }
        if n:
            row.update(
                {"auroc": _classification_metrics(probs[mask], labels[mask])["auroc"]}
            )
        rows.append(row)
    return rows


def robustness_report(results: list[ReliabilityResult], labels: np.ndarray) -> dict:
    """Accuracy and flip rate of the ensemble under each perturbation family
    and severity, measured across the whole test split."""
    acc: dict[tuple[str, int], list[int]] = defaultdict(list)
    flip: dict[tuple[str, int], list[int]] = defaultdict(list)

    for r, y in zip(results, labels):
        for row in r.perturbation_table:
            key = (row["family"], row["severity"])
            variant_pred = CLASS_NAMES.index(row["predicted_class"])
            acc[key].append(int(variant_pred == int(y)))
            flip[key].append(int(row["flipped"]))

    clean_acc = float(
        np.mean([r.predicted_index == int(y) for r, y in zip(results, labels)])
    )
    families = []
    for fam_key, fam in FAMILY_BY_KEY.items():
        families.append(
            {
                "family": fam_key,
                "family_label": fam.label,
                "description": fam.description,
                "severities": [
                    {
                        "severity": s,
                        "magnitude": fam.magnitude(s),
                        "accuracy": round(float(np.mean(acc[(fam_key, s)])), 4),
                        "accuracy_drop": round(clean_acc - float(np.mean(acc[(fam_key, s)])), 4),
                        "flip_rate": round(float(np.mean(flip[(fam_key, s)])), 4),
                    }
                    for s in SEVERITIES
                ],
            }
        )
    families.sort(key=lambda f: -f["severities"][-1]["flip_rate"])
    return {"clean_accuracy": round(clean_acc, 4), "families": families}


def ood_report(analyzer: Analyzer, results: list[ReliabilityResult]) -> dict:
    """How well the Mahalanobis detector separates chest films from a genuinely
    different modality (breast ultrasound, also MedMNIST / CC BY 4.0)."""
    in_pct = np.array([r.ood_detail["percentile"] for r in results])
    in_dist = np.array([r.ood_detail["distance"] for r in results])

    probes, _ = load_split("test", flag=OOD_PROBE_DATASET)
    feats = member_features(
        analyzer.models[analyzer.feature_index], to_model_tensor(probes)
    ).numpy()
    ood_dist = analyzer.ood.distance(feats)
    ood_pct = analyzer.ood.percentile(feats)

    y = np.concatenate([np.zeros(len(in_dist)), np.ones(len(ood_dist))])
    d = np.concatenate([in_dist, ood_dist])

    return {
        "method": "class-conditional Mahalanobis (Ledoit-Wolf tied covariance) on penultimate features",
        "feature_member": analyzer.member_names[analyzer.feature_index],
        "in_distribution": {
            "source": "PneumoniaMNIST test split",
            "n": int(len(in_dist)),
            "mean_percentile": round(float(in_pct.mean()), 4),
            "frac_above_hard_gate": round(
                float((in_pct >= analyzer.config.ood_hard_pct).mean()), 4
            ),
        },
        "out_of_distribution": {
            "source": f"{OOD_PROBE_DATASET} test split (breast ultrasound, CC BY 4.0)",
            "n": int(len(ood_dist)),
            "mean_percentile": round(float(ood_pct.mean()), 4),
            "frac_above_hard_gate": round(
                float((ood_pct >= analyzer.config.ood_hard_pct).mean()), 4
            ),
        },
        "detection_auroc": round(_auroc(d, y), 4),
        "hard_gate_percentile": analyzer.config.ood_hard_pct,
    }


def case_rows(results: list[ReliabilityResult], labels: np.ndarray) -> list[dict]:
    rows = []
    for i, (r, y) in enumerate(zip(results, labels)):
        rows.append(
            {
                "index": int(i),
                "true_class": CLASS_NAMES[int(y)],
                "predicted_class": r.predicted_class,
                "correct": bool(r.predicted_index == int(y)),
                "confidence": round(r.confidence, 4),
                "reliability_score": round(r.reliability_score, 1),
                "verdict": r.verdict,
                "n_flips": r.perturbation_summary["n_flips"],
                "mean_abs_delta": r.perturbation_summary["mean_abs_delta"],
                "ensemble_std": r.ensemble_detail["std"],
                "unanimous": r.ensemble_detail["unanimous"],
                "ood_percentile": r.ood_detail["percentile"],
                "subscores": {s.key: round(s.value, 4) for s in r.subscores},
            }
        )
    return rows


# --------------------------------------------------------------------- main


def main() -> None:
    print("loading models…", flush=True)
    analyzer = Analyzer()

    val_imgs, val_labels = load_split("val")
    test_imgs, test_labels = load_split("test")

    print(f"measuring validation split ({len(val_imgs)} images)…", flush=True)
    val_m = analyzer.measure_batch(val_imgs, progress=_progress("val"))
    print(f"measuring test split ({len(test_imgs)} images)…", flush=True)
    test_m = analyzer.measure_batch(test_imgs, progress=_progress("test"))

    # ---- stage 1: choose thresholds on validation only -------------------
    seed_cfg = ReliabilityConfig()
    val_seed = [assess(m.bundle(analyzer.member_names), seed_cfg) for m in val_m]
    chosen = select_thresholds(val_seed, val_labels)
    (ARTIFACT_DIR / "reliability_config.json").write_text(json.dumps(chosen, indent=2))
    print(
        f"\nthresholds selected on validation: PASS ≥ {chosen['pass_threshold']}, "
        f"REVIEW ≥ {chosen['review_threshold']} "
        f"(val PASS coverage {chosen['selection']['val_pass_coverage']}, "
        f"accuracy {chosen['selection']['val_pass_accuracy']})\n",
        flush=True,
    )

    # ---- stage 2: freeze and evaluate ------------------------------------
    analyzer.reload_config()
    cfg = analyzer.config
    val_results = [assess(m.bundle(analyzer.member_names), cfg) for m in val_m]
    test_results = [assess(m.bundle(analyzer.member_names), cfg) for m in test_m]

    probs_cal = np.stack([[1 - r.prob_pneumonia, r.prob_pneumonia] for r in test_results])
    probs_raw = np.stack([m.ensemble_prob_raw for m in test_m])
    y = test_labels

    ece_cal, bins_cal = expected_calibration_error(probs_cal, y)
    ece_raw, bins_raw = expected_calibration_error(probs_raw, y)

    scores = np.array([r.reliability_score for r in test_results])
    conf = np.array([r.confidence for r in test_results])
    correct = np.array([r.predicted_index == int(t) for r, t in zip(test_results, y)])

    summary = {
        "generated_by": "python -m scanproof.evaluate",
        "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "dataset": dataset_metadata(),
        "model": analyzer.model_card(),
        "perturbation_battery": family_catalogue(),
        "splits": {
            "threshold_selection": {"split": "val", "n": int(len(val_labels))},
            "reported": {"split": "test", "n": int(len(y))},
        },
        "classification": {
            "test": _classification_metrics(probs_cal, y),
            "validation": _classification_metrics(
                np.stack([[1 - r.prob_pneumonia, r.prob_pneumonia] for r in val_results]),
                val_labels,
            ),
            "class_balance_test": {
                CLASS_NAMES[c]: int((y == c).sum()) for c in (0, 1)
            },
        },
        "calibration": {
            "note": (
                "Temperature scaling is fit per member on the validation split. It cannot "
                "change any prediction — only the reported confidence."
            ),
            "ece_raw": round(ece_raw, 4),
            "ece_calibrated": round(ece_cal, 4),
            "brier_raw": round(brier_score(probs_raw, y), 4),
            "brier_calibrated": round(brier_score(probs_cal, y), 4),
            "nll_raw": round(negative_log_likelihood(probs_raw, y), 4),
            "nll_calibrated": round(negative_log_likelihood(probs_cal, y), 4),
            "reliability_diagram": {"raw": bins_raw, "calibrated": bins_cal},
        },
        "reliability_bands": {
            "thresholds": {
                "pass": cfg.pass_threshold,
                "review": cfg.review_threshold,
                "source": cfg.source,
            },
            "test": band_report(test_results, y),
            "validation": band_report(val_results, val_labels),
        },
        "selective_prediction": {
            "note": (
                "Both curves rank the same 624 test predictions and retain the top fraction. "
                "AURC is the mean error rate across all coverage levels — lower is better."
            ),
            "by_reliability_score": _selective_curve(scores, correct),
            "by_confidence_only": _selective_curve(conf, correct),
        },
        "robustness": robustness_report(test_results, y),
        "ood": ood_report(analyzer, test_results),
        "disclaimer": (
            "Research prototype. Metrics describe behaviour on the PneumoniaMNIST test split "
            "only. Nothing here is a claim of clinical validity, safety or regulatory fitness."
        ),
    }

    (ARTIFACT_DIR / "audit_summary.json").write_text(json.dumps(summary, indent=2))
    (ARTIFACT_DIR / "audit_cases.json").write_text(
        json.dumps({"split": "test", "cases": case_rows(test_results, y)}, indent=2)
    )

    c = summary["classification"]["test"]
    sp = summary["selective_prediction"]
    print(f"test accuracy {c['accuracy']}  AUROC {c['auroc']}  "
          f"ECE {ece_raw:.4f} → {ece_cal:.4f}")
    for row in summary["reliability_bands"]["test"]:
        print(f"  {row['band']:<6} n={row['n']:<4} coverage={row['coverage']:.3f}  "
              f"accuracy={row['accuracy']}")
    print(f"AURC  reliability {sp['by_reliability_score']['aurc']}  vs  "
          f"confidence-only {sp['by_confidence_only']['aurc']}")
    print(f"OOD detection AUROC {summary['ood']['detection_auroc']}")
    print(f"\nwrote {ARTIFACT_DIR / 'audit_summary.json'}")


if __name__ == "__main__":
    main()
