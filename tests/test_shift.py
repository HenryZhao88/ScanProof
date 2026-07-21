"""The domain-shift study carries the central claim, so its machinery is tested
independently of whether the 1.4 GB adult archive is present.

The scoring functions are pure and get synthetic inputs with a known answer.
The dataset builder is only exercised when the data has been downloaded.
"""

from __future__ import annotations

import numpy as np
import pytest

from scanproof.config import ReliabilityConfig
from scanproof.perturbations import FAMILIES, SEVERITIES
from scanproof.reliability import SignalBundle, assess
from scanproof.shift import detection_table, two_regime_table

VARIANT_KEYS = [(f.key, s) for f in FAMILIES for s in SEVERITIES]
N_VAR = len(VARIANT_KEYS)
CFG = ReliabilityConfig(pass_threshold=78.0, review_threshold=58.0)


def make(*, pos: float, spread: float = 0.0, ood: float = 0.5, flip_to: float | None = None):
    """One synthetic result with the knobs the study reads."""
    members = np.array(
        [[1 - p, p] for p in (pos - spread, pos, pos + spread)], dtype=float
    ).clip(0.001, 0.999)
    ens = members.mean(axis=0)
    vp = np.tile(ens, (N_VAR, 1))
    if flip_to is not None:
        vp[:, 1] = flip_to
        vp[:, 0] = 1 - flip_to
    return assess(
        SignalBundle(
            member_probs=members,
            member_names=["m0", "m1", "m2"],
            ensemble_prob=ens,
            variant_probs=vp,
            variant_keys=list(VARIANT_KEYS),
            ood_percentile=ood,
            ood_distance=10.0,
        ),
        CFG,
    )


# --------------------------------------------------------------- detection


def test_detection_is_chance_when_a_signal_carries_nothing():
    """Two arms identical in every respect except the OOD percentile: the
    confidence signal must land at chance, the embedding signal at 1.0."""
    ref = [make(pos=0.95, ood=0.4) for _ in range(40)]
    shifted = [make(pos=0.95, ood=0.999) for _ in range(40)]

    rows = {r["signal"]: r["auroc"] for r in detection_table(ref, shifted)}
    assert rows["Model confidence (1 − p)"] == pytest.approx(0.5, abs=1e-9)
    assert rows["Embedding percentile"] == pytest.approx(1.0)
    assert rows["ScanProof reliability (100 − s)"] == pytest.approx(1.0)


def test_detection_below_half_when_shifted_inputs_are_more_confident():
    """The orientation must be honest: if the model is *more* confident on
    shifted data, confidence-as-a-shift-signal has to score below chance rather
    than being silently flipped."""
    ref = [make(pos=0.75) for _ in range(30)]
    shifted = [make(pos=0.99) for _ in range(30)]
    rows = {r["signal"]: r["auroc"] for r in detection_table(ref, shifted)}
    assert rows["Model confidence (1 − p)"] < 0.5


def test_detection_table_is_sorted_and_flags_the_composite():
    ref = [make(pos=0.9, ood=0.3) for _ in range(20)]
    shifted = [make(pos=0.9, ood=0.99) for _ in range(20)]
    rows = detection_table(ref, shifted)
    assert [r["auroc"] for r in rows] == sorted((r["auroc"] for r in rows), reverse=True)
    assert sum(r["is_composite"] for r in rows) == 1


# -------------------------------------------------------------- two regime


def test_two_regime_separates_the_two_failure_modes():
    """Construct the situation the product claims exists: one signal that is
    perfect in-distribution and blind to shift, one that is the reverse."""
    rng = np.random.default_rng(0)
    # in-distribution: confidence tracks correctness, OOD percentile is noise
    in_dist, labels = [], []
    for i in range(80):
        correct = i % 4 != 0
        pos = 0.97 if correct else 0.55
        in_dist.append(make(pos=pos, ood=float(rng.uniform(0.2, 0.6))))
        labels.append(1 if correct else 0)  # prediction is PNEUMONIA throughout
    labels = np.array(labels)

    # shift arms: same confidence, wildly different embedding percentile
    ref = [make(pos=0.97, ood=0.4) for _ in range(40)]
    shifted = [make(pos=0.97, ood=0.999) for _ in range(40)]

    table = two_regime_table(in_dist, labels, ref, shifted)
    rows = {r["signal"]: r for r in table["rows"]}

    assert rows["Model confidence"]["good_in_distribution"]
    assert not rows["Model confidence"]["good_under_shift"]
    assert rows["Embedding percentile"]["good_under_shift"]
    assert not rows["Embedding percentile"]["good_in_distribution"]
    # the composite exists to be the one that clears both
    assert rows["ScanProof composite"]["good_in_both"]
    assert "ScanProof composite" in table["signals_good_in_both"]


def test_two_regime_rows_cover_every_signal():
    labels = np.array([1, 0] * 20)
    in_dist = [make(pos=0.9 if y else 0.4) for y in labels]
    ref = [make(pos=0.9, ood=0.3) for _ in range(20)]
    shifted = [make(pos=0.9, ood=0.99) for _ in range(20)]
    table = two_regime_table(in_dist, labels, ref, shifted)
    assert len(table["rows"]) == 5
    for r in table["rows"]:
        assert 0.0 <= r["shift_detection_auroc"] <= 1.0
        assert 0.0 <= r["in_distribution_aurc"] <= 1.0


# ------------------------------------------------------------ the dataset


def _shift_data_present() -> bool:
    """True only for a *complete* archive.

    A plain `.exists()` is not enough: a partial download is still a file, and
    medmnist reacts to a failed checksum by re-fetching 1.4 GB inside the test
    run. An npz keeps its zip central directory at the end of the file, so
    opening one is a cheap completeness check.
    """
    from scanproof.config import DATA_DIR

    path = DATA_DIR / "chestmnist_128.npz"
    if not path.exists():
        return False
    try:
        with np.load(path) as z:
            return "test_images" in z.files
    except Exception:
        return False


needs_data = pytest.mark.skipif(
    not _shift_data_present(), reason="adult archive absent; run `make shift-data`"
)


@needs_data
def test_shift_set_is_balanced_and_deterministic():
    from scanproof.config import SOURCE_SIZE
    from scanproof.data import load_domain_shift_set

    x1, y1, meta = load_domain_shift_set()
    x2, y2, _ = load_domain_shift_set()

    assert np.array_equal(x1, x2) and np.array_equal(y1, y2), "shift set must be deterministic"
    assert x1.shape[1:] == (SOURCE_SIZE, SOURCE_SIZE)
    assert x1.dtype == np.uint8
    assert y1.sum() * 2 == len(y1), "classes must be balanced"
    assert meta["n_total"] == len(y1)
    assert meta["license_ok"] if "license_ok" in meta else True


@needs_data
def test_shift_negatives_really_have_no_finding():
    """The negative class must be 'no finding', not 'some other pathology' —
    otherwise the arm is a different task, not a shifted one."""
    from scanproof.data import CHEST_PNEUMONIA_IDX, SHIFT_SIZE, load_split

    _, labels = load_split("test", flag="chestmnist", size=SHIFT_SIZE)
    positive = labels[:, CHEST_PNEUMONIA_IDX] == 1
    no_finding = labels.sum(axis=1) == 0
    assert not (positive & no_finding).any(), "a film cannot be both pneumonia and no-finding"
    assert no_finding.sum() > 1000


@needs_data
def test_resolution_control_matches_the_pediatric_test_split():
    from scanproof.data import load_resolution_control, load_split

    ctrl_x, ctrl_y = load_resolution_control()
    _, native_y = load_split("test")
    assert np.array_equal(ctrl_y, native_y), "control must be the same films in the same order"
    assert ctrl_x.shape == (len(native_y), 224, 224)
