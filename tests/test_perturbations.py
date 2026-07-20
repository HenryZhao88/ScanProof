"""The perturbation battery must be deterministic, in-range, and monotone in
severity — otherwise the stability evidence shown in the UI is not reproducible
and the severity axis of the sweep chart means nothing."""

import numpy as np
import pytest

from scanproof.perturbations import (
    FAMILIES,
    N_VARIANTS,
    SEVERITIES,
    build_variants,
    family_catalogue,
)


@pytest.fixture
def img() -> np.ndarray:
    rng = np.random.default_rng(0)
    base = np.linspace(20, 220, 224, dtype=np.float32)
    x = np.outer(np.ones(224, dtype=np.float32), base)
    x += rng.normal(0, 6, x.shape)
    return np.clip(x, 0, 255).astype(np.uint8)


@pytest.mark.parametrize("fam", FAMILIES, ids=lambda f: f.key)
@pytest.mark.parametrize("sev", SEVERITIES)
def test_output_contract(fam, sev, img):
    out = fam.apply(img, sev)
    assert out.dtype == np.uint8
    assert out.shape == img.shape
    assert 0 <= out.min() and out.max() <= 255


@pytest.mark.parametrize("fam", FAMILIES, ids=lambda f: f.key)
def test_deterministic(fam, img):
    """A case analysed twice must produce byte-identical evidence."""
    for sev in SEVERITIES:
        assert np.array_equal(fam.apply(img, sev), fam.apply(img, sev))


@pytest.mark.parametrize("fam", FAMILIES, ids=lambda f: f.key)
def test_severity_is_monotone(fam, img):
    """Severity 3 must depart from the original at least as much as severity 1.
    The sweep chart plots severity on the x-axis; if this failed, the axis
    would be ordered by a label that does not correspond to magnitude."""
    d = [float(np.abs(fam.apply(img, s).astype(int) - img.astype(int)).mean()) for s in SEVERITIES]
    assert d[0] <= d[1] + 1e-6 <= d[2] + 1e-6, f"{fam.key} not monotone: {d}"
    assert d[0] > 0, f"{fam.key} severity 1 is a no-op"


@pytest.mark.parametrize("fam", FAMILIES, ids=lambda f: f.key)
def test_perturbation_preserves_structure(fam, img):
    """These stand in for benign acquisition variation. If a 'perturbation'
    destroyed the image, a flip would be unremarkable rather than evidence.

    Structure, not pixel distance, is the property that matters: a large
    exposure shift moves every pixel a long way while leaving the anatomy
    perfectly legible, so correlation is the honest check here.
    """
    worst = fam.apply(img, SEVERITIES[-1]).astype(np.float64).ravel()
    original = img.astype(np.float64).ravel()
    r = np.corrcoef(worst, original)[0, 1]
    assert r > 0.6, f"{fam.key} at max severity destroys structure (r={r:.3f})"


def test_rotation_has_no_black_corners(img):
    """Reflect padding matters: black corners would be their own out-of-
    distribution cue and would confound the stability signal with the OOD one."""
    from scanproof.perturbations import FAMILY_BY_KEY

    out = FAMILY_BY_KEY["rotation"].apply(img, 3)
    corners = [out[:12, :12], out[:12, -12:], out[-12:, :12], out[-12:, -12:]]
    assert all(c.mean() > 5 for c in corners)


def test_build_variants_shape_and_keys(img):
    stack, keys = build_variants(img)
    assert stack.shape == (N_VARIANTS, 224, 224)
    assert len(keys) == N_VARIANTS
    assert len(set(keys)) == N_VARIANTS
    assert {k for k, _ in keys} == {f.key for f in FAMILIES}


def test_catalogue_matches_families():
    cat = family_catalogue()
    assert len(cat) == len(FAMILIES)
    for entry in cat:
        assert len(entry["severities"]) == len(SEVERITIES)
        assert all(s["magnitude"] for s in entry["severities"])


def test_invalid_severity_rejected(img):
    with pytest.raises(ValueError):
        FAMILIES[0].apply(img, 4)
