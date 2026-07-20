"""Central configuration: paths, model/data constants, reliability thresholds.

Everything tunable lives here so the reliability formula stays auditable from one file.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
MODEL_DIR = ROOT / "models"
ARTIFACT_DIR = ROOT / "artifacts"
DEMO_DIR = ROOT / "demo_cases"
FRONTEND_DIST = ROOT / "frontend" / "dist"

for _d in (DATA_DIR, MODEL_DIR, ARTIFACT_DIR, DEMO_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- data / model

DATASET = "pneumoniamnist"
OOD_PROBE_DATASET = "breastmnist"
#: MedMNIST+ ships 28/64/128/224. We keep 224 on disk (display quality) and
#: downsample to MODEL_SIZE at inference so uploads and demo cases share one path.
SOURCE_SIZE = 224
MODEL_SIZE = 128

CLASS_NAMES = ("NORMAL", "PNEUMONIA")

#: ImageNet statistics — the backbones are ImageNet-pretrained, so we keep their
#: normalisation and simply replicate the grayscale channel three times.
NORM_MEAN = (0.485, 0.456, 0.406)
NORM_STD = (0.229, 0.224, 0.225)


@dataclass(frozen=True)
class MemberSpec:
    """One ensemble member. Architectures deliberately differ so that
    disagreement carries information beyond seed noise."""

    name: str
    arch: str
    seed: int
    augment: str  # "light" | "strong"


#: densenet121 is the standard chest-radiograph backbone in the literature
#: (CheXNet), which makes member 2 architecturally different from the ResNets
#: rather than a reseed of the same inductive bias.
ENSEMBLE: tuple[MemberSpec, ...] = (
    MemberSpec("m0-resnet18", "resnet18", seed=0, augment="light"),
    MemberSpec("m1-resnet18s", "resnet18", seed=1, augment="strong"),
    MemberSpec("m2-densenet121", "densenet121", seed=2, augment="light"),
)
#: Member whose penultimate features back the embedding/OOD detector.
FEATURE_MEMBER = "m0-resnet18"

EPOCHS = 8
BATCH_SIZE = 64
LR = 3e-4
WEIGHT_DECAY = 1e-4


def device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


# --------------------------------------------------------------- reliability

#: Weights of the four reliability sub-scores. Must sum to 1.0.
WEIGHTS: dict[str, float] = {
    "confidence": 0.20,
    "stability": 0.40,
    "agreement": 0.25,
    "typicality": 0.15,
}

#: Stability sub-score shaping. flip_rate dominates: a prediction that changes
#: class under a mild, label-preserving perturbation is the strongest evidence
#: of unreliability we can gather without a ground-truth label.
STABILITY_FLIP_WEIGHT = 0.65
STABILITY_SHIFT_WEIGHT = 0.35
#: Probability shift (mean |Δp| across variants) that maps to a zero sub-score.
STABILITY_SHIFT_REF = 0.25

#: Ensemble std-dev of P(pneumonia) that maps to a zero agreement sub-score.
AGREEMENT_STD_REF = 0.25

#: Mahalanobis percentile (vs. the training distribution) above which the image
#: is treated as atypical. 1.0 = more distant than every training image.
TYPICALITY_SOFT_PCT = 0.90  # sub-score starts falling here
OOD_HARD_PCT = 0.995  # hard BLOCK gate

#: Verdict bands over the 0-100 reliability score. These defaults are replaced
#: by data-driven values written to artifacts/reliability_config.json by
#: `python -m scanproof.evaluate`, which selects them on the VALIDATION split.
DEFAULT_PASS_THRESHOLD = 78.0
DEFAULT_REVIEW_THRESHOLD = 58.0

#: Target selective accuracy the PASS band must reach on validation. The
#: threshold search picks the lowest threshold (max coverage) that meets it.
#: The validation split is in-distribution and the ensemble scores ~98% on it,
#: so the bar is set close to ceiling — a 0.97 target would be met by passing
#: everything, which would make the verdict carry no information.
PASS_TARGET_ACCURACY = 0.99
#: Fraction of the validation split allowed to fall in BLOCK.
BLOCK_BUDGET = 0.12
#: Coverage cap on the PASS band. Accuracy alone cannot pin the threshold on a
#: split the model nearly saturates, so we also reserve a fixed share of
#: validation for REVIEW/BLOCK. The final threshold is the stricter of the two
#: rules — a standard coverage-budget-plus-accuracy-guard selective policy.
MAX_PASS_COVERAGE = 0.70


@dataclass
class ReliabilityConfig:
    """Runtime thresholds. Loaded from artifacts when available."""

    pass_threshold: float = DEFAULT_PASS_THRESHOLD
    review_threshold: float = DEFAULT_REVIEW_THRESHOLD
    ood_hard_pct: float = OOD_HARD_PCT
    weights: dict[str, float] = field(default_factory=lambda: dict(WEIGHTS))
    source: str = "defaults (thresholds not yet calibrated)"

    @classmethod
    def load(cls) -> "ReliabilityConfig":
        import json

        path = ARTIFACT_DIR / "reliability_config.json"
        if not path.exists():
            return cls()
        raw = json.loads(path.read_text())
        return cls(
            pass_threshold=raw["pass_threshold"],
            review_threshold=raw["review_threshold"],
            ood_hard_pct=raw.get("ood_hard_pct", OOD_HARD_PCT),
            weights=raw.get("weights", dict(WEIGHTS)),
            source=raw.get("source", "artifacts/reliability_config.json"),
        )
