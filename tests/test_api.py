"""API contract, including the degraded path.

These run without model weights: `State.analyzer` stays None, which is exactly
the mode a machine that has cloned the repo but not run training will be in.
The demo must still work there, and uploads must fail with an actionable
message rather than a stack trace.
"""

import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from scanproof import api as api_mod


@pytest.fixture
def cached_client(monkeypatch):
    """Server with the demo manifest loaded but no model weights."""
    monkeypatch.setattr(api_mod.State, "analyzer", None, raising=False)
    monkeypatch.setattr(api_mod.State, "load_error", "weights absent (test)", raising=False)
    app = api_mod.create_app()
    with TestClient(app) as client:
        # create_app's startup handler reloads state; force the degraded mode back on
        api_mod.State.analyzer = None
        api_mod.State.load_error = "weights absent (test)"
        yield client


def test_health_reports_degraded_mode(cached_client):
    r = cached_client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["live_inference"] is False
    assert "not for diagnosis" in body["disclaimer"].lower()


def test_battery_is_always_available(cached_client):
    """The test battery is a static definition — it must not need weights."""
    r = cached_client.get("/api/battery")
    assert r.status_code == 200
    families = r.json()["families"]
    assert len(families) == 7
    assert all(len(f["severities"]) == 3 for f in families)


def test_demo_cases_listed_with_previews(cached_client):
    r = cached_client.get("/api/demo-cases")
    if r.status_code == 503:
        pytest.skip("demo deck not built; run `python -m scanproof.demo`")
    cases = r.json()["cases"]
    assert cases
    for c in cases:
        assert c["preview"]["verdict"] in ("PASS", "REVIEW", "BLOCK")
        assert 0.0 <= c["preview"]["confidence"] <= 1.0
        assert c["license"]


def test_demo_analysis_falls_back_to_cache(cached_client):
    listing = cached_client.get("/api/demo-cases")
    if listing.status_code == 503:
        pytest.skip("demo deck not built")
    case_id = listing.json()["cases"][0]["id"]

    r = cached_client.post(f"/api/analyze/demo/{case_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["live"] is False
    assert "cached" in body["note"].lower()

    result = body["result"]
    assert result["verdict"] in ("PASS", "REVIEW", "BLOCK")
    assert len(result["subscores"]) == 4
    assert len(result["perturbation_table"]) == 21
    assert result["evidence"]


def test_unknown_demo_case_is_404(cached_client):
    assert cached_client.post("/api/analyze/demo/does-not-exist").status_code == 404


def test_upload_without_weights_is_503_with_a_next_step(cached_client):
    png = io.BytesIO()
    Image.fromarray(np.zeros((64, 64), dtype=np.uint8), mode="L").save(png, format="PNG")
    r = cached_client.post("/api/analyze", files={"file": ("x.png", png.getvalue(), "image/png")})
    assert r.status_code == 503
    assert "scanproof.train" in r.json()["detail"]


def test_audit_endpoint_matches_the_artifact(cached_client):
    r = cached_client.get("/api/audit")
    if r.status_code == 503:
        pytest.skip("audit artifact not built; run `python -m scanproof.evaluate`")
    body = r.json()
    assert body["dataset"]["license"] == "CC BY 4.0"
    bands = body["reliability_bands"]["test"]
    assert {b["band"] for b in bands} == {"PASS", "REVIEW", "BLOCK"}
    assert sum(b["n"] for b in bands) == body["classification"]["test"]["n"]
    # coverage must partition the split
    assert sum(b["coverage"] for b in bands) == pytest.approx(1.0, abs=1e-3)


def test_prepare_image_normalises_arbitrary_input():
    from scanproof.pipeline import prepare_image

    buf = io.BytesIO()
    Image.new("RGB", (640, 400), (30, 90, 200)).save(buf, format="PNG")
    out = prepare_image(buf.getvalue())
    assert out.shape == (224, 224)
    assert out.dtype == np.uint8


def test_prepare_image_rejects_non_images():
    from scanproof.pipeline import prepare_image

    with pytest.raises(ValueError):
        prepare_image(b"this is not an image")
