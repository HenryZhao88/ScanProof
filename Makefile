PY := .venv/bin/python
UVICORN := .venv/bin/uvicorn

.PHONY: help setup data shift-data train audit shift demo build serve dev test preflight clean-artifacts reproduce

help:
	@echo "ScanProof — research prototype, not for diagnosis"
	@echo
	@echo "  make setup      create .venv and install python + node dependencies"
	@echo "  make data       download PneumoniaMNIST + the OOD probe set (~250 MB, once)"
	@echo "  make shift-data download the adult ChestMNIST arm (~1.4 GB, once)"
	@echo "  make train      fine-tune the 3-member ensemble, calibrate, fit OOD stats (~15 min)"
	@echo "  make audit      select thresholds on val, evaluate on test, write artifacts/"
	@echo "  make shift      run the domain-shift study (pediatric vs adult films)"
	@echo "  make demo       build the demo case deck from the audit"
	@echo "  make build      build the frontend into frontend/dist"
	@echo "  make serve      run the app on http://127.0.0.1:8000 (single process)"
	@echo "  make dev        API on :8000 + Vite dev server on :5173"
	@echo "  make test       run the test suite"
	@echo "  make preflight  verify the demo path end to end before recording"
	@echo "  make reproduce  data -> shift-data -> train -> audit -> shift -> demo -> build"

setup:
	uv venv --python 3.12 .venv
	uv pip install --python $(PY) -e ".[dev]"
	cd frontend && npm install

data:
	$(PY) -c "from scanproof.data import load_split, load_ood_probes; \
	[load_split(s) for s in ('train','val','test')]; load_ood_probes(4); print('datasets ready')"

# The adult arm of the domain-shift study. ~1.4 GB, MD5-verified by medmnist,
# and it will refuse a truncated file rather than use it — re-run on failure.
shift-data:
	$(PY) -c "from scanproof.data import load_domain_shift_set, load_resolution_control; \
	load_domain_shift_set(); load_resolution_control(); print('shift datasets ready')"

train:
	$(PY) -m scanproof.train

audit:
	$(PY) -m scanproof.evaluate

shift:
	$(PY) -m scanproof.shift

demo:
	$(PY) -m scanproof.demo

build:
	cd frontend && npm run build

serve: build
	$(UVICORN) scanproof.api:app --host 127.0.0.1 --port 8000

dev:
	@echo "starting API on :8000 and Vite on :5173 — Ctrl-C stops both"
	@$(UVICORN) scanproof.api:app --reload --port 8000 & \
	cd frontend && npm run dev; kill %1 2>/dev/null || true

test:
	$(PY) -m pytest

preflight:
	$(PY) -m scanproof.preflight

reproduce: data shift-data train audit shift demo build
	@echo "full pipeline complete — run 'make serve'"

clean-artifacts:
	rm -f artifacts/audit_cases.json artifacts/shift_cases.json
