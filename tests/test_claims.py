"""Every number quoted in a public-facing document must match the artifacts.

README.md, DEVPOST.md and VIDEO.md all cite figures from
``artifacts/``. Those files are written by hand; the artifacts are regenerated
by ``make audit`` / ``make shift``. Without this test, re-running a study would
silently leave stale numbers in the submission copy.

The test parses the numbers back out of the prose and compares them to the
artifact, so it fails loudly rather than drifting.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"

pytestmark = pytest.mark.skipif(
    not (ARTIFACTS / "shift_study.json").exists()
    or not (ARTIFACTS / "audit_summary.json").exists(),
    reason="artifacts absent; run `make audit` and `make shift`",
)


@pytest.fixture(scope="module")
def shift() -> dict:
    return json.loads((ARTIFACTS / "shift_study.json").read_text())


@pytest.fixture(scope="module")
def audit() -> dict:
    return json.loads((ARTIFACTS / "audit_summary.json").read_text())


@pytest.fixture(scope="module")
def arms(shift) -> dict:
    return {a["name"]: a for a in shift["arms"]}


DOCS = ["README.md", "DEVPOST.md", "VIDEO.md"]


def _docs_text() -> str:
    return "\n".join((ROOT / d).read_text() for d in DOCS if (ROOT / d).exists())


def _pct(x: float) -> str:
    return f"{x * 100:.1f}"


# ------------------------------------------------------- the headline figures


def test_deployment_numbers_appear_verbatim(arms):
    """The three label-free headline numbers, pediatric → adult."""
    text = _docs_text()
    ped, adult = arms["resolution_control"], arms["domain_shift"]

    expected = [
        _pct(ped["model_confidence"]["mean"]),
        _pct(adult["model_confidence"]["mean"]),
        _pct(ped["verdicts"]["PASS"]["share"]),
        _pct(adult["verdicts"]["PASS"]["share"]),
    ]
    missing = [v for v in expected if v not in text]
    assert not missing, f"figures quoted nowhere in the docs: {missing}"


def test_sample_sizes_are_accurate(arms):
    text = _docs_text()
    for name in ("resolution_control", "domain_shift", "in_distribution"):
        n = arms[name]["n"]
        assert str(n) in text, f"n={n} for {name} is never stated"


def test_two_regime_table_matches_artifact(shift):
    """The AURC/AUROC table is the most quoted and most falsifiable block."""
    text = _docs_text()
    for row in shift["two_regime"]["rows"]:
        for key in ("in_distribution_aurc", "shift_detection_auroc"):
            v = f"{row[key]:.4f}"
            assert v in text, f"{row['signal']} {key}={v} missing from the docs"


def test_confound_control_deltas_are_quoted(shift):
    text = _docs_text()
    ctrl = shift["resolution_control"]
    # quoted in the docs as points, e.g. +0.96 pts / -1.1 pts
    assert f"{abs(ctrl['pass_rate_delta']) * 100:.2f}" in text
    assert f"{abs(ctrl['accuracy_delta']) * 100:.1f}" in text


def test_in_distribution_headline_matches(audit):
    text = _docs_text()
    c = audit["classification"]["test"]
    assert _pct(c["accuracy"]) in text
    assert f"{c['auroc']:.3f}" in text
    band = next(b for b in audit["reliability_bands"]["test"] if b["band"] == "PASS")
    assert _pct(band["accuracy"]) in text
    assert _pct(band["coverage"]) in text


def test_errors_outside_pass_band_is_arithmetic(audit):
    """'28 of the 36 test errors fall outside PASS' must actually add up."""
    bands = audit["reliability_bands"]["test"]
    total = sum(b["errors"] for b in bands)
    in_pass = next(b for b in bands if b["band"] == "PASS")["errors"]
    outside = total - in_pass
    text = _docs_text()
    assert f"{outside} of the {total}" in text, (
        f"expected the phrase '{outside} of the {total}' describing errors outside PASS"
    )


# ------------------------------------------------------------ claim hygiene


def test_no_unsupported_equivalence_claims():
    """PneumoniaMNIST and ChestX-ray14 do not share a label definition. Any
    copy asserting they ask the same question is factually wrong."""
    text = _docs_text().lower()
    banned = [
        "same question",
        "same task",
        "identical task",
        "same label",
    ]
    hits = [b for b in banned if b in text]
    assert not hits, f"unsupported equivalence claim(s) in the docs: {hits}"


def test_no_clinical_safety_language():
    text = _docs_text().lower()
    banned = [
        "clinically validated",
        "clinically safe to",
        "fda",
        "ce mark",
        "diagnostic tool for",
        "safe for clinical use",
    ]
    hits = [b for b in banned if b in text]
    assert not hits, f"clinical-safety language in the docs: {hits}"


def test_negative_result_is_stated(shift):
    """The submission must not read as 'our score beats confidence'."""
    text = _docs_text()
    conf = next(r for r in shift["two_regime"]["rows"] if r["signal"] == "Model confidence")
    comp = next(r for r in shift["two_regime"]["rows"] if r["is_composite"])
    assert conf["in_distribution_aurc"] < comp["in_distribution_aurc"], (
        "artifact changed: confidence no longer wins in-distribution, so the "
        "negative-result copy needs rewriting"
    )
    assert f"{conf['in_distribution_aurc']:.4f}" in text
    assert re.search(r"no signal clears both", text, re.I), (
        "the docs must state that no signal clears both regimes"
    )


def test_disclaimer_present_in_every_doc():
    for d in DOCS:
        path = ROOT / d
        if not path.exists():
            continue
        t = path.read_text().lower()
        assert "not for diagnosis" in t, f"{d} is missing the research-prototype disclaimer"
