"""The reliability engine is where a wrong number becomes a wrong claim to a
user, so its arithmetic and its gates are pinned down here."""

import numpy as np
import pytest

from scanproof.config import ReliabilityConfig
from scanproof.perturbations import FAMILIES, SEVERITIES
from scanproof.reliability import BLOCK, PASS, REVIEW, SignalBundle, assess

MEMBERS = ["m0", "m1", "m2"]
VARIANT_KEYS = [(f.key, s) for f in FAMILIES for s in SEVERITIES]
N_VAR = len(VARIANT_KEYS)


def bundle(
    *,
    ensemble=(0.02, 0.98),
    members=((0.02, 0.98), (0.02, 0.98), (0.02, 0.98)),
    variant_pos=None,
    ood_pct=0.5,
) -> SignalBundle:
    """Build a bundle. `variant_pos` is P(pneumonia) per variant."""
    if variant_pos is None:
        variant_pos = [ensemble[1]] * N_VAR
    vp = np.array([[1 - p, p] for p in variant_pos], dtype=float)
    return SignalBundle(
        member_probs=np.array(members, dtype=float),
        member_names=list(MEMBERS),
        ensemble_prob=np.array(ensemble, dtype=float),
        variant_probs=vp,
        variant_keys=list(VARIANT_KEYS),
        ood_percentile=ood_pct,
        ood_distance=12.0,
    )


CFG = ReliabilityConfig(pass_threshold=78.0, review_threshold=58.0)


def test_ideal_case_passes_with_full_marks():
    r = assess(bundle(), CFG)
    assert r.verdict == PASS
    assert r.predicted_class == "PNEUMONIA"
    assert r.reliability_score == pytest.approx(100.0, abs=0.01)
    assert r.perturbation_summary["n_flips"] == 0
    assert all(e.level == "ok" for e in r.evidence)


def test_score_is_the_weighted_sum_of_subscores():
    r = assess(bundle(variant_pos=[0.7] * N_VAR, ood_pct=0.95), CFG)
    expected = 100.0 * sum(s.value * s.weight for s in r.subscores)
    assert r.reliability_score == pytest.approx(expected, abs=1e-9)
    assert sum(s.weight for s in r.subscores) == pytest.approx(1.0)


def test_weights_sum_to_one_in_config():
    assert sum(ReliabilityConfig().weights.values()) == pytest.approx(1.0)


def test_confident_but_unstable_is_not_a_pass():
    """The product thesis in one assertion: high confidence, unstable label."""
    # every severity-2 and -3 variant flips to NORMAL
    pos = [0.98 if s == 1 else 0.2 for _, s in VARIANT_KEYS]
    r = assess(bundle(variant_pos=pos), CFG)
    assert r.confidence > 0.95
    assert r.verdict in (REVIEW, BLOCK)
    assert any(e.source == "stability" and e.level == "critical" for e in r.evidence)


def test_mild_flip_gate_caps_a_high_score_at_review():
    # a single severity-1 flip; everything else is pristine
    pos = [0.45 if (k, s) == VARIANT_KEYS[0] else 0.98 for k, s in VARIANT_KEYS]
    r = assess(bundle(variant_pos=pos), CFG)
    assert r.reliability_score > CFG.pass_threshold
    assert r.verdict == REVIEW
    assert any("Fragility gate" in g for g in r.gates)


@pytest.mark.parametrize(
    "members",
    [
        ((0.55, 0.45), (0.02, 0.98), (0.03, 0.97)),
        ((0.51, 0.49), (0.10, 0.90), (0.08, 0.92)),
        ((0.60, 0.40), (0.40, 0.60), (0.45, 0.55)),
    ],
)
def test_split_vote_never_passes(members):
    """A disagreement between checkpoints must never reach PASS, whichever
    mechanism gets there — the agreement sub-score, the gate, or both."""
    mean = np.array(members, dtype=float).mean(axis=0)
    r = assess(bundle(ensemble=tuple(mean), members=members), CFG)
    assert not r.ensemble_detail["unanimous"]
    assert r.verdict != PASS
    assert any(e.source == "agreement" and e.level == "critical" for e in r.evidence)


def test_split_vote_gate_logic_is_correct():
    """The split-vote gate is a backstop: in practice the agreement sub-score
    already drags a split vote below the PASS threshold on its own, so the gate
    rarely fires. It is unit-tested directly to keep the guarantee true even if
    the weights are retuned later."""
    from scanproof.reliability import GateInputs, decide_verdict

    verdict, gates = decide_verdict(
        95.0, GateInputs(ood_percentile=0.5, mild_flip=None, unanimous=False), CFG
    )
    assert verdict == REVIEW
    assert any("Split-vote gate" in g for g in gates)

    verdict, gates = decide_verdict(
        95.0, GateInputs(ood_percentile=0.5, mild_flip=None, unanimous=True), CFG
    )
    assert verdict == PASS
    assert gates == []


def test_ood_gate_forces_block_regardless_of_everything_else():
    r = assess(bundle(ood_pct=0.999), CFG)
    assert r.verdict == BLOCK
    assert any("OOD gate" in g for g in r.gates)
    assert any(e.source == "typicality" and e.level == "critical" for e in r.evidence)


def test_ood_gate_beats_an_otherwise_perfect_case():
    perfect = assess(bundle(), CFG)
    assert perfect.verdict == PASS
    gated = assess(bundle(ood_pct=1.0), CFG)
    assert gated.verdict == BLOCK


def test_typicality_subscore_decays_only_past_the_soft_gate():
    below = assess(bundle(ood_pct=0.5), CFG)
    at = assess(bundle(ood_pct=0.90), CFG)
    past = assess(bundle(ood_pct=0.95), CFG)
    val = lambda r: next(s.value for s in r.subscores if s.key == "typicality")  # noqa: E731
    assert val(below) == pytest.approx(1.0)
    assert val(at) == pytest.approx(1.0)
    assert 0.0 < val(past) < 1.0


def test_subscores_stay_in_range_under_extremes():
    r = assess(
        bundle(
            ensemble=(0.5, 0.5),
            members=((0.99, 0.01), (0.01, 0.99), (0.5, 0.5)),
            variant_pos=[0.0] * N_VAR,
            ood_pct=1.0,
        ),
        CFG,
    )
    assert all(0.0 <= s.value <= 1.0 for s in r.subscores)
    assert 0.0 <= r.reliability_score <= 100.0


def test_perturbation_table_is_complete_and_flags_flips():
    pos = [0.3] * N_VAR
    r = assess(bundle(variant_pos=pos), CFG)
    assert len(r.perturbation_table) == N_VAR
    assert all(row["flipped"] for row in r.perturbation_table)
    assert r.perturbation_summary["flip_rate"] == pytest.approx(1.0)
    assert r.perturbation_summary["n_flips"] == N_VAR


def test_evidence_is_ordered_by_severity():
    r = assess(bundle(variant_pos=[0.2] * N_VAR, ood_pct=0.999), CFG)
    order = {"critical": 0, "warning": 1, "ok": 2}
    levels = [order[e.level] for e in r.evidence]
    assert levels == sorted(levels)


def test_gate_inputs_round_trip_for_rescoring():
    """evaluate.py re-bands stored results under candidate thresholds using
    this property instead of re-running the network."""
    pos = [0.45 if s == 1 and k == "brightness" else 0.98 for k, s in VARIANT_KEYS]
    r = assess(bundle(variant_pos=pos, ood_pct=0.3), CFG)
    gi = r.gate_inputs
    assert gi.mild_flip is not None and "Brightness" in gi.mild_flip
    assert gi.unanimous is True
    assert gi.ood_percentile == pytest.approx(0.3)


def test_serialisation_is_json_safe():
    import json

    d = assess(bundle(variant_pos=[0.3] * N_VAR, ood_pct=0.97), CFG).to_dict()
    json.dumps(d)  # must not raise on numpy scalars
    assert d["verdict"] in (PASS, REVIEW, BLOCK)
    assert len(d["subscores"]) == 4
