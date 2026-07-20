"""The reliability engine: raw signals in, PASS / REVIEW / BLOCK out.

The product claim is that *confidence* and *reliability* are different things.
A model can output 0.97 on an image whose prediction collapses under a 24%
brightness shift; that case is confident and unreliable. This module makes that
distinction explicit and, critically, **traceable** — every point deducted from
the reliability score is attributable to a named measurement.

Four sub-scores, each in [0, 1], combined by fixed weights (config.WEIGHTS):

  confidence  Calibrated margin of the ensemble's predicted class.
  stability   Does the prediction survive the perturbation battery?
  agreement   Do three independently-trained checkpoints concur?
  typicality  Is the embedding within the training manifold?

Two hard gates sit on top of the weighted score, because some failures should
not be averaged away by good scores elsewhere:

  * OOD gate     — embedding percentile >= ood_hard_pct forces BLOCK.
  * Fragility gate — a class flip at the *mildest* severity caps the verdict
                     at REVIEW no matter how high the score.

Thresholds are not hand-picked: `python -m scanproof.evaluate` selects them on
the validation split and writes artifacts/reliability_config.json.

None of this is a statement about clinical safety. PASS means "this prediction
was stable under the tests we ran", not "this prediction is correct".
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np

from .config import (
    AGREEMENT_STD_REF,
    CLASS_NAMES,
    STABILITY_FLIP_WEIGHT,
    STABILITY_SHIFT_REF,
    STABILITY_SHIFT_WEIGHT,
    TYPICALITY_SOFT_PCT,
    ReliabilityConfig,
)
from .perturbations import FAMILY_BY_KEY, SEVERITIES

PASS, REVIEW, BLOCK = "PASS", "REVIEW", "BLOCK"

#: flip rate that drives the stability flip term to zero
FLIP_SATURATION = 0.25
#: calibrated confidence at/above which the confidence sub-score saturates
CONF_SATURATION = 0.95


def _clamp01(x: float) -> float:
    return float(min(1.0, max(0.0, x)))


@dataclass
class GateInputs:
    """The three facts the hard gates depend on. Extracted as a value so the
    threshold sweep in evaluate.py can re-derive verdicts for thousands of
    candidate thresholds without re-running the network."""

    ood_percentile: float
    mild_flip: str | None  # description of a flip at the mildest severity
    unanimous: bool


def decide_verdict(
    score: float, gi: GateInputs, cfg: ReliabilityConfig
) -> tuple[str, list[str]]:
    """Band the score, then apply the hard gates. Single source of truth for
    the verdict — used by both `assess` and the offline threshold search."""
    verdict = (
        PASS if score >= cfg.pass_threshold
        else REVIEW if score >= cfg.review_threshold
        else BLOCK
    )
    gates: list[str] = []

    if gi.ood_percentile >= cfg.ood_hard_pct:
        verdict = BLOCK
        gates.append(
            f"OOD gate: embedding percentile {gi.ood_percentile * 100:.1f} ≥ "
            f"{cfg.ood_hard_pct * 100:.1f} → BLOCK"
        )

    if gi.mild_flip is not None and verdict == PASS:
        verdict = REVIEW
        gates.append(
            f"Fragility gate: label flipped at the mildest severity ({gi.mild_flip}) "
            f"→ capped at REVIEW"
        )

    # Backstop. In practice the agreement sub-score already pushes a split vote
    # below the PASS threshold before this runs — a member on the far side of
    # the boundary forces a wide spread — so this rarely fires. It stays so the
    # guarantee "a split vote never passes" survives any retuning of the weights.
    if not gi.unanimous and verdict == PASS:
        verdict = REVIEW
        gates.append("Split-vote gate: checkpoints disagree on the label → capped at REVIEW")

    return verdict, gates


def gate_inputs_from(
    ood_percentile: float, mild_flip_row: dict | None, unanimous: bool
) -> GateInputs:
    desc = (
        f"{mild_flip_row['family_label']} {mild_flip_row['magnitude']}"
        if mild_flip_row is not None
        else None
    )
    return GateInputs(ood_percentile=ood_percentile, mild_flip=desc, unanimous=unanimous)


@dataclass
class SubScore:
    key: str
    label: str
    value: float  # 0..1
    weight: float
    detail: str  # exact, quotable measurement

    @property
    def contribution(self) -> float:
        return self.value * self.weight

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "value": round(self.value, 4),
            "weight": self.weight,
            "points": round(self.contribution * 100, 2),
            "max_points": round(self.weight * 100, 2),
            "detail": self.detail,
        }


@dataclass
class Evidence:
    level: str  # "critical" | "warning" | "ok"
    source: str  # which sub-score / gate produced it
    title: str
    detail: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class SignalBundle:
    """Raw measurements for one image. Produced by pipeline.py."""

    member_probs: np.ndarray  # [M, 2] temperature-scaled, per member
    member_names: list[str]
    ensemble_prob: np.ndarray  # [2]
    variant_probs: np.ndarray  # [V, 2] ensemble mean per perturbed variant
    variant_keys: list[tuple[str, int]]
    ood_percentile: float
    ood_distance: float


@dataclass
class ReliabilityResult:
    predicted_class: str
    predicted_index: int
    confidence: float
    prob_pneumonia: float
    reliability_score: float
    verdict: str
    subscores: list[SubScore]
    evidence: list[Evidence]
    gates: list[str]
    perturbation_table: list[dict]
    perturbation_summary: dict
    ensemble_detail: dict
    ood_detail: dict
    thresholds: dict = field(default_factory=dict)

    @property
    def gate_inputs(self) -> GateInputs:
        """Re-derive the gate inputs, so a result scored under one threshold set
        can be re-banded under another without touching the network."""
        mild = next(
            (r for r in self.perturbation_table
             if r["flipped"] and r["severity"] == min(SEVERITIES)),
            None,
        )
        return gate_inputs_from(
            self.ood_detail["percentile"], mild, self.ensemble_detail["unanimous"]
        )

    def to_dict(self) -> dict:
        return {
            "predicted_class": self.predicted_class,
            "predicted_index": self.predicted_index,
            "confidence": round(self.confidence, 4),
            "prob_pneumonia": round(self.prob_pneumonia, 4),
            "reliability_score": round(self.reliability_score, 1),
            "verdict": self.verdict,
            "subscores": [s.to_dict() for s in self.subscores],
            "evidence": [e.to_dict() for e in self.evidence],
            "gates": self.gates,
            "perturbation_table": self.perturbation_table,
            "perturbation_summary": self.perturbation_summary,
            "ensemble": self.ensemble_detail,
            "ood": self.ood_detail,
            "thresholds": self.thresholds,
        }


# --------------------------------------------------------------------- core


def assess(bundle: SignalBundle, cfg: ReliabilityConfig | None = None) -> ReliabilityResult:
    cfg = cfg or ReliabilityConfig.load()
    w = cfg.weights

    ens = np.asarray(bundle.ensemble_prob, dtype=np.float64)
    pred = int(ens.argmax())
    conf = float(ens[pred])
    pred_name = CLASS_NAMES[pred]

    evidence: list[Evidence] = []
    gates: list[str] = []

    # ---------------------------------------------------------- confidence
    conf_sub = _clamp01((conf - 0.5) / (CONF_SATURATION - 0.5))
    confidence = SubScore(
        "confidence",
        "Calibrated confidence",
        conf_sub,
        w["confidence"],
        f"Temperature-scaled ensemble confidence {conf:.3f} for {pred_name} "
        f"(margin {abs(ens[1] - ens[0]):.3f}).",
    )

    # ----------------------------------------------------------- stability
    vp = np.asarray(bundle.variant_probs, dtype=np.float64)
    n_var = len(vp)
    flips = vp.argmax(axis=1) != pred
    shifts = np.abs(vp[:, pred] - conf)
    flip_rate = float(flips.mean()) if n_var else 0.0
    mean_shift = float(shifts.mean()) if n_var else 0.0
    worst_i = int(shifts.argmax()) if n_var else 0

    flip_term = _clamp01(flip_rate / FLIP_SATURATION)
    shift_term = _clamp01(mean_shift / STABILITY_SHIFT_REF)
    stab_sub = _clamp01(1.0 - (STABILITY_FLIP_WEIGHT * flip_term + STABILITY_SHIFT_WEIGHT * shift_term))

    n_flips = int(flips.sum())
    stability = SubScore(
        "stability",
        "Perturbation stability",
        stab_sub,
        w["stability"],
        f"{n_flips}/{n_var} of the perturbed variants changed the predicted class; "
        f"mean |Δ P({pred_name})| = {mean_shift:.3f}.",
    )

    # per-variant table + per-family rollup
    table: list[dict] = []
    for i, (fam_key, sev) in enumerate(bundle.variant_keys):
        fam = FAMILY_BY_KEY[fam_key]
        table.append(
            {
                "family": fam_key,
                "family_label": fam.label,
                "severity": sev,
                "magnitude": fam.magnitude(sev),
                "prob_pneumonia": round(float(vp[i, 1]), 4),
                "prob_predicted": round(float(vp[i, pred]), 4),
                "delta": round(float(vp[i, pred] - conf), 4),
                "flipped": bool(flips[i]),
                "predicted_class": CLASS_NAMES[int(vp[i].argmax())],
            }
        )

    # evidence: name the exact tests that broke
    flipped_rows = [r for r in table if r["flipped"]]
    if flipped_rows:
        worst_flip = min(flipped_rows, key=lambda r: r["prob_predicted"])
        others = len(flipped_rows) - 1
        suffix = f" (+{others} other variant{'s' if others != 1 else ''})" if others else ""
        evidence.append(
            Evidence(
                "critical",
                "stability",
                f"Prediction flips under {worst_flip['family_label']} {worst_flip['magnitude']}",
                f"P({pred_name}) falls {conf:.3f} → {worst_flip['prob_predicted']:.3f}, "
                f"changing the label to {worst_flip['predicted_class']}{suffix}. "
                f"This perturbation does not change the underlying finding.",
            )
        )
    elif n_var:
        worst = table[worst_i]
        evidence.append(
            Evidence(
                "ok",
                "stability",
                f"Prediction held across all {n_var} perturbation variants",
                f"Largest shift was {worst['family_label']} {worst['magnitude']} "
                f"at Δ = {worst['delta']:+.3f}; no variant changed the label.",
            )
        )
    if n_var and not flipped_rows and mean_shift > 0.08:
        worst = table[worst_i]
        evidence.append(
            Evidence(
                "warning",
                "stability",
                "Confidence is sensitive to acquisition variation",
                f"Mean |Δ| of {mean_shift:.3f} across the battery, peaking at "
                f"{worst['family_label']} {worst['magnitude']} (Δ = {worst['delta']:+.3f}). "
                f"The label is stable but the confidence value is not.",
            )
        )

    family_rollup = []
    for fam in {k for k, _ in bundle.variant_keys}:
        rows = [r for r in table if r["family"] == fam]
        family_rollup.append(
            {
                "family": fam,
                "family_label": FAMILY_BY_KEY[fam].label,
                "flips": sum(r["flipped"] for r in rows),
                "max_abs_delta": round(max(abs(r["delta"]) for r in rows), 4),
            }
        )
    family_rollup.sort(key=lambda r: (-r["flips"], -r["max_abs_delta"]))

    perturbation_summary = {
        "n_variants": n_var,
        "n_flips": n_flips,
        "flip_rate": round(flip_rate, 4),
        "mean_abs_delta": round(mean_shift, 4),
        "max_abs_delta": round(float(shifts.max()) if n_var else 0.0, 4),
        "by_family": family_rollup,
    }

    # ----------------------------------------------------------- agreement
    mp = np.asarray(bundle.member_probs, dtype=np.float64)
    member_pos = mp[:, 1]
    std = float(member_pos.std(ddof=0))
    member_preds = mp.argmax(axis=1)
    unanimous = bool((member_preds == pred).all())

    agree_sub = _clamp01(1.0 - std / AGREEMENT_STD_REF)
    if not unanimous:
        # A split vote is qualitatively worse than a wide-but-same-side spread.
        agree_sub = min(agree_sub, 0.35)

    spread = ", ".join(f"{n}: {p:.3f}" for n, p in zip(bundle.member_names, member_pos))
    agreement = SubScore(
        "agreement",
        "Checkpoint agreement",
        agree_sub,
        w["agreement"],
        f"P(PNEUMONIA) across {len(mp)} independently-trained checkpoints — {spread} "
        f"(σ = {std:.3f}){'' if unanimous else '; the vote is split'}.",
    )

    if not unanimous:
        dissent = [
            bundle.member_names[i] for i in range(len(mp)) if member_preds[i] != pred
        ]
        evidence.append(
            Evidence(
                "critical",
                "agreement",
                f"Checkpoints disagree on the label ({len(dissent)}/{len(mp)} dissenting)",
                f"{', '.join(dissent)} predict{'s' if len(dissent) == 1 else ''} the opposite "
                f"class. Member probabilities — {spread}.",
            )
        )
    elif std > 0.12:
        evidence.append(
            Evidence(
                "warning",
                "agreement",
                "Checkpoints agree on the label but not on the strength",
                f"σ = {std:.3f} across members ({spread}). The ensemble mean hides a wide spread.",
            )
        )
    else:
        evidence.append(
            Evidence(
                "ok",
                "agreement",
                "All checkpoints agree",
                f"σ = {std:.3f} across members ({spread}).",
            )
        )

    ensemble_detail = {
        "members": [
            {"name": n, "prob_pneumonia": round(float(p), 4),
             "predicted_class": CLASS_NAMES[int(mp[i].argmax())]}
            for i, (n, p) in enumerate(zip(bundle.member_names, member_pos))
        ],
        "std": round(std, 4),
        "unanimous": unanimous,
    }

    # ---------------------------------------------------------- typicality
    pct = float(bundle.ood_percentile)
    typ_sub = _clamp01(1.0 - (pct - TYPICALITY_SOFT_PCT) / (1.0 - TYPICALITY_SOFT_PCT))
    typicality = SubScore(
        "typicality",
        "Embedding typicality",
        typ_sub,
        w["typicality"],
        f"Mahalanobis distance {bundle.ood_distance:.1f} sits at the "
        f"{pct * 100:.1f}th percentile of the training distribution.",
    )

    if pct >= cfg.ood_hard_pct:
        evidence.append(
            Evidence(
                "critical",
                "typicality",
                f"Input is outside the training distribution ({pct * 100:.1f}th percentile)",
                f"Only {(1 - pct) * 100:.2f}% of training chest films are this far from every "
                f"class centre. The classifier has no comparable examples to reason from, so its "
                f"output is not interpretable regardless of confidence.",
            )
        )
    elif pct >= TYPICALITY_SOFT_PCT:
        evidence.append(
            Evidence(
                "warning",
                "typicality",
                f"Atypical image for this model ({pct * 100:.1f}th percentile)",
                f"The embedding is further from the training manifold than "
                f"{pct * 100:.1f}% of training images.",
            )
        )
    else:
        evidence.append(
            Evidence(
                "ok",
                "typicality",
                f"Image is typical of the training data ({pct * 100:.1f}th percentile)",
                f"Mahalanobis distance {bundle.ood_distance:.1f}, well inside the training manifold.",
            )
        )

    # confidence evidence last so it reads after the harder signals
    if conf >= 0.90 and (flipped_rows or not unanimous):
        evidence.append(
            Evidence(
                "warning",
                "confidence",
                "High confidence is not supported by the stability tests",
                f"The model reports {conf * 100:.1f}% confidence, but the checks above show the "
                f"prediction is not stable. This is exactly the case confidence alone misses.",
            )
        )
    elif conf < 0.70:
        evidence.append(
            Evidence(
                "warning",
                "confidence",
                f"Low calibrated confidence ({conf * 100:.1f}%)",
                f"The decision margin is {abs(ens[1] - ens[0]):.3f}; the model is close to the "
                f"decision boundary before any perturbation is applied.",
            )
        )

    # --------------------------------------------------------------- score
    subscores = [confidence, stability, agreement, typicality]
    score = 100.0 * sum(s.contribution for s in subscores)

    mild = next((r for r in flipped_rows if r["severity"] == min(SEVERITIES)), None)
    gate_inputs = gate_inputs_from(pct, mild, unanimous)
    verdict, gates = decide_verdict(score, gate_inputs, cfg)

    order = {"critical": 0, "warning": 1, "ok": 2}
    evidence.sort(key=lambda e: order[e.level])

    return ReliabilityResult(
        predicted_class=pred_name,
        predicted_index=pred,
        confidence=conf,
        prob_pneumonia=float(ens[1]),
        reliability_score=score,
        verdict=verdict,
        subscores=subscores,
        evidence=evidence,
        gates=gates,
        perturbation_table=table,
        perturbation_summary=perturbation_summary,
        ensemble_detail=ensemble_detail,
        ood_detail={
            "distance": round(float(bundle.ood_distance), 3),
            "percentile": round(pct, 5),
            "hard_gate_percentile": cfg.ood_hard_pct,
            "soft_gate_percentile": TYPICALITY_SOFT_PCT,
        },
        thresholds={
            "pass": cfg.pass_threshold,
            "review": cfg.review_threshold,
            "source": cfg.source,
        },
    )
