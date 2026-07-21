"""FastAPI service.

    uvicorn scanproof.api:app --reload --port 8000

Endpoints
  GET  /api/health         readiness + which mode the server is in
  GET  /api/model-card     ensemble composition, thresholds, sub-score weights
  GET  /api/battery        the perturbation test battery definition
  GET  /api/demo-cases     the shipped demo deck (metadata + thumbnails)
  POST /api/analyze/demo/{case_id}   analyse a demo case
  POST /api/analyze        analyse an uploaded image
  GET  /api/audit          the committed aggregate audit summary

Degraded mode: if model weights are absent the server still starts and serves
demo cases from their cached results, flagged as ``live: false``. Uploads
return 503 with an actionable message rather than a stack trace. This keeps the
demo path dependable on a machine that has not run training.
"""

from __future__ import annotations

import json
import logging
import time
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
from fastapi import APIRouter, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .config import ARTIFACT_DIR, DEMO_DIR, FRONTEND_DIST
from .perturbations import family_catalogue
from .pipeline import Analyzer, image_to_png_data_uri, prepare_image

log = logging.getLogger("scanproof")

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
DISCLAIMER = (
    "Research prototype — not for diagnosis. ScanProof evaluates whether a model's "
    "prediction is stable under controlled tests. It does not establish clinical "
    "correctness or safety."
)


class State:
    """Lazily-initialised process state. Model loading happens on startup, but a
    failure is captured rather than raised so the app can still serve the audit
    view and the cached demo deck."""

    analyzer: Analyzer | None = None
    load_error: str | None = None
    manifest: dict[str, Any] = {}
    audit: dict[str, Any] | None = None

    @classmethod
    def demo_case(cls, case_id: str) -> dict:
        case = cls.manifest.get(case_id)
        if case is None:
            raise HTTPException(404, f"Unknown demo case {case_id!r}.")
        return case


def _load_state() -> None:
    manifest_path = DEMO_DIR / "manifest.json"
    if manifest_path.exists():
        raw = json.loads(manifest_path.read_text())
        State.manifest = {c["id"]: c for c in raw["cases"]}
        log.info("loaded %d demo cases", len(State.manifest))
    else:
        log.warning("no demo manifest at %s — run `python -m scanproof.demo`", manifest_path)

    audit_path = ARTIFACT_DIR / "audit_summary.json"
    if audit_path.exists():
        State.audit = json.loads(audit_path.read_text())

    try:
        t0 = time.time()
        State.analyzer = Analyzer()
        log.info("ensemble ready in %.1fs on %s", time.time() - t0, State.analyzer.device)
    except FileNotFoundError as exc:
        State.load_error = str(exc)
        log.warning("running in cached-only mode: %s", exc)


api = APIRouter(prefix="/api")


@api.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "live_inference": State.analyzer is not None,
        "load_error": State.load_error,
        "demo_cases": len(State.manifest),
        "audit_available": State.audit is not None,
        "disclaimer": DISCLAIMER,
    }


@api.get("/model-card")
def model_card() -> dict:
    if State.analyzer is None:
        if State.audit:
            return State.audit["model"]
        raise HTTPException(503, State.load_error or "Models are not loaded.")
    return State.analyzer.model_card()


@api.get("/battery")
def battery() -> dict:
    return {"families": family_catalogue()}


@api.get("/demo-cases")
def demo_cases() -> dict:
    if not State.manifest:
        raise HTTPException(
            503, "No demo cases available. Run `python -m scanproof.demo` to build them."
        )
    cases = []
    for c in State.manifest.values():
        cached = c["cached_result"]
        cases.append(
            {
                "id": c["id"],
                "title": c["title"],
                "why_included": c["why_included"],
                "source": c["source"],
                "true_class": c["true_class"],
                "license": c["license"],
                "image_url": f"/api/demo-cases/{c['id']}/image",
                "preview": {
                    "verdict": cached["verdict"],
                    "predicted_class": cached["predicted_class"],
                    "confidence": cached["confidence"],
                    "reliability_score": cached["reliability_score"],
                },
            }
        )
    return {"cases": cases, "disclaimer": DISCLAIMER}


@api.get("/demo-cases/{case_id}/image")
def demo_image(case_id: str):
    case = State.demo_case(case_id)
    path = DEMO_DIR / case["image"]
    if not path.exists():
        raise HTTPException(404, f"Image file missing for {case_id!r}.")
    return FileResponse(path, media_type="image/png")


@api.post("/analyze/demo/{case_id}")
def analyze_demo(case_id: str) -> dict:
    """Recompute a demo case live. The pipeline is deterministic, so the result
    matches the cached one; if models are unavailable we serve the cache and say so."""
    case = State.demo_case(case_id)
    meta = {
        "case_id": case_id,
        "title": case["title"],
        "why_included": case["why_included"],
        "source": case["source"],
        "true_class": case["true_class"],
        "license": case["license"],
        "image_url": f"/api/demo-cases/{case_id}/image",
        "disclaimer": DISCLAIMER,
    }

    if State.analyzer is None:
        return {**meta, "live": False,
                "note": "Served from cached results (model weights not loaded).",
                "elapsed_ms": 0, "result": case["cached_result"]}

    from PIL import Image

    img = np.asarray(Image.open(DEMO_DIR / case["image"]).convert("L"), dtype=np.uint8)
    t0 = time.time()
    result = State.analyzer.analyze(img)
    return {**meta, "live": True, "elapsed_ms": round((time.time() - t0) * 1000),
            "result": result.to_dict()}


@api.post("/analyze")
async def analyze_upload(file: UploadFile) -> dict:
    if State.analyzer is None:
        raise HTTPException(
            503,
            "Live inference is unavailable because model weights are missing. "
            "Run `python -m scanproof.train`, or use a built-in demo case.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "The uploaded file is empty.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.")

    try:
        img = prepare_image(raw)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    t0 = time.time()
    result = State.analyzer.analyze(img)
    return {
        "case_id": None,
        "title": file.filename or "Uploaded image",
        "why_included": None,
        "source": "user upload",
        "true_class": None,
        "license": None,
        "image_url": image_to_png_data_uri(img),
        "live": True,
        "elapsed_ms": round((time.time() - t0) * 1000),
        "result": result.to_dict(),
        "disclaimer": DISCLAIMER,
    }


@api.get("/audit")
def audit() -> dict:
    if State.audit is None:
        raise HTTPException(
            503, "No audit artifact found. Run `python -m scanproof.evaluate` to generate it."
        )
    return State.audit


@asynccontextmanager
async def lifespan(_: FastAPI):
    _load_state()
    yield


def create_app() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    app = FastAPI(
        title="ScanProof",
        version="0.1.0",
        description=DISCLAIMER,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api)

    # Serve the built SPA when it exists, so the demo is one process and one port.
    if FRONTEND_DIST.exists():
        from fastapi.staticfiles import StaticFiles

        app.mount(
            "/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="spa"
        )
    else:

        @app.get("/")
        def _no_frontend() -> JSONResponse:
            return JSONResponse(
                {
                    "message": "API is running. Build the frontend (`npm run build` in "
                    "frontend/) or use the Vite dev server on :5173.",
                    "docs": "/docs",
                }
            )

    return app


app = create_app()
