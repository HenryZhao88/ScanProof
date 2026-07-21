"""Demo readiness check.

    python -m scanproof.preflight

Run this before recording. It verifies every asset the demo path touches and,
most importantly, re-analyses every shipped demo case live and checks the result
against the cached one. That is what makes the cache honest: if live inference
and the committed manifest ever disagreed, the demo would be showing numbers the
code no longer produces.

Exits non-zero if anything the demo depends on is missing or inconsistent.
"""

from __future__ import annotations

import json
import sys
import time

import numpy as np

from .config import ARTIFACT_DIR, DEMO_DIR, ENSEMBLE, FRONTEND_DIST, MODEL_DIR

OK, WARN, FAIL = "ok", "warn", "fail"

_MARK = {OK: "✓", WARN: "!", FAIL: "✕"}


class Report:
    def __init__(self) -> None:
        self.rows: list[tuple[str, str, str]] = []

    def add(self, status: str, name: str, detail: str = "") -> None:
        self.rows.append((status, name, detail))
        print(f"  {_MARK[status]} {name:<46}{detail}", flush=True)

    @property
    def failed(self) -> int:
        return sum(1 for s, _, _ in self.rows if s == FAIL)

    @property
    def warned(self) -> int:
        return sum(1 for s, _, _ in self.rows if s == WARN)


def check_assets(r: Report) -> None:
    print("\nassets")
    for spec in ENSEMBLE:
        p = MODEL_DIR / f"{spec.name}.pt"
        r.add(
            OK if p.exists() else FAIL,
            f"weights · {spec.name}",
            f"{p.stat().st_size / 1e6:.0f} MB" if p.exists() else "missing — run `make train`",
        )
    ood = MODEL_DIR / "ood_mahalanobis.npz"
    r.add(OK if ood.exists() else FAIL, "OOD statistics", "" if ood.exists() else "run `make train`")

    for name, cmd in (
        ("calibration.json", "make train"),
        ("reliability_config.json", "make audit"),
        ("audit_summary.json", "make audit"),
        ("shift_study.json", "make shift"),
    ):
        p = ARTIFACT_DIR / name
        r.add(OK if p.exists() else FAIL, f"artifact · {name}", "" if p.exists() else f"run `{cmd}`")

    dist = FRONTEND_DIST / "index.html"
    r.add(
        OK if dist.exists() else FAIL,
        "frontend build",
        "" if dist.exists() else "run `make build`",
    )


def check_artifacts_are_real(r: Report) -> None:
    """Guard against a placeholder artifact ever reaching a demo."""
    print("\nartifact sanity")
    for name in ("audit_summary.json", "shift_study.json"):
        p = ARTIFACT_DIR / name
        if not p.exists():
            continue
        raw = p.read_text()
        blob = json.loads(raw)
        mocked = blob.get("MOCK") or "MOCK" in raw
        r.add(
            FAIL if mocked else OK,
            f"{name} is real output",
            "contains MOCK markers" if mocked else blob.get("generated_by", ""),
        )

    shift_p = ARTIFACT_DIR / "shift_study.json"
    if shift_p.exists():
        s = json.loads(shift_p.read_text())
        ctrl = s.get("resolution_control", {})
        holds = abs(ctrl.get("pass_rate_delta", 1.0)) <= 0.20
        r.add(
            OK if holds else FAIL,
            "shift study · resolution control holds",
            f"PASS Δ {ctrl.get('pass_rate_delta')}",
        )


def check_demo_cases(r: Report) -> None:
    """Re-run every demo case live and compare against its cached result."""
    print("\ndemo deck · live vs cached")
    manifest_path = DEMO_DIR / "manifest.json"
    if not manifest_path.exists():
        r.add(FAIL, "demo manifest", "missing — run `make demo`")
        return

    cases = json.loads(manifest_path.read_text())["cases"]
    r.add(OK if cases else FAIL, "demo manifest", f"{len(cases)} cases")

    try:
        from PIL import Image

        from .pipeline import Analyzer

        analyzer = Analyzer()
    except Exception as exc:  # noqa: BLE001 - surfaced to the operator
        r.add(FAIL, "load ensemble", str(exc)[:60])
        return

    timings = []
    for case in cases:
        img_path = DEMO_DIR / case["image"]
        if not img_path.exists():
            r.add(FAIL, f"case · {case['id']}", "image file missing")
            continue

        img = np.asarray(Image.open(img_path).convert("L"), dtype=np.uint8)
        t0 = time.time()
        live = analyzer.analyze(img)
        timings.append(time.time() - t0)
        cached = case["cached_result"]

        same_verdict = live.verdict == cached["verdict"]
        score_delta = abs(live.reliability_score - cached["reliability_score"])
        conf_delta = abs(live.confidence - cached["confidence"])
        agrees = same_verdict and score_delta < 0.05 and conf_delta < 0.005

        r.add(
            OK if agrees else FAIL,
            f"case · {case['id']}",
            f"{live.verdict} {live.reliability_score:.1f}"
            + ("" if agrees else f"  ≠ cached {cached['verdict']} {cached['reliability_score']}"),
        )

    if timings:
        slowest = max(timings)
        r.add(
            OK if slowest < 5.0 else WARN,
            "live analysis latency",
            f"median {np.median(timings) * 1000:.0f} ms · slowest {slowest * 1000:.0f} ms",
        )


def check_demo_narrative(r: Report) -> None:
    """The recorded demo depends on specific cases existing and landing on
    specific verdicts. Catch a deck that no longer tells the story."""
    print("\ndemo narrative")
    manifest_path = DEMO_DIR / "manifest.json"
    if not manifest_path.exists():
        return
    cases = {c["id"]: c for c in json.loads(manifest_path.read_text())["cases"]}

    expected = [
        ("stable-pneumonia", "PASS"),
        ("confident-but-fragile", None),
        ("shift-adult-confident", None),
        ("ood-ultrasound-1", "BLOCK"),
        ("confidently-wrong-missed", "PASS"),
    ]
    for case_id, want in expected:
        case = cases.get(case_id)
        if case is None:
            r.add(FAIL, f"beat · {case_id}", "missing from deck")
            continue
        got = case["cached_result"]["verdict"]
        good = want is None or got == want
        r.add(
            OK if good else FAIL,
            f"beat · {case_id}",
            got + ("" if good else f" (expected {want})"),
        )

    # the fragile and adult beats must not be PASS, or the story inverts
    for case_id in ("confident-but-fragile", "shift-adult-confident"):
        case = cases.get(case_id)
        if case and case["cached_result"]["verdict"] == "PASS":
            r.add(FAIL, f"beat · {case_id} is withheld", "landed on PASS — narrative broken")


def main() -> None:
    print("ScanProof preflight — research prototype, not for diagnosis")
    r = Report()
    check_assets(r)
    check_artifacts_are_real(r)
    check_demo_cases(r)
    check_demo_narrative(r)

    print("\n" + "-" * 72)
    if r.failed:
        print(f"NOT READY — {r.failed} check(s) failed")
        sys.exit(1)
    print(f"READY — {len(r.rows)} checks passed" + (f", {r.warned} warning(s)" if r.warned else ""))
    print("start the demo with: make serve   →   http://127.0.0.1:8000")


if __name__ == "__main__":
    main()
