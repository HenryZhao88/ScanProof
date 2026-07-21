# ScanProof — running task list

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## Milestone 1 — foundation ✅
- [x] Inspect folder / establish brief (folder was empty; the task prompt is the brief)
- [x] Verify dataset license + provenance (PneumoniaMNIST, MedMNIST v2, CC BY 4.0)
- [x] Init git on `main`, `.gitignore` excluding data/weights/caches/secrets
- [x] Python 3.12 venv + deps (torch 2.13, torchvision, medmnist, fastapi, sklearn)

## Milestone 2 — model ✅
- [x] `data.py` — MedMNIST download/loaders + OOD probe set
- [x] `models.py` — 3-member heterogeneous ensemble (2× ResNet-18 + DenseNet-121)
- [x] `train.py` — fine-tune members, save weights + fitted temperature
- [x] `calibration.py` — temperature scaling on val, ECE / Brier / NLL
- [x] **Fixed:** augmentation ran after normalisation → train/serve domain skew.
      Val accuracy 0.746 → 0.985.
- [x] **Fixed:** EfficientNet-B0 collapsed to AUROC 0.499 → replaced with DenseNet-121

## Milestone 3 — reliability engine ✅
- [x] `perturbations.py` — 7 families × 3 severities, deterministic
- [x] `ood.py` — class-conditional Mahalanobis → training-distribution percentile
- [x] `reliability.py` — 4 sub-scores → score → PASS/REVIEW/BLOCK + evidence
- [x] `pipeline.py` — batched end-to-end analysis
- [x] Threshold selection on validation only (accuracy guard + coverage cap)

## Milestone 4 — evaluation + artifacts ✅
- [x] `evaluate.py` — full audit → committed JSON artifacts
- [x] Selective-prediction table per band (PASS 97.9% / REVIEW 90.0% / BLOCK 87.7%)
- [x] Risk–coverage curves, robustness curves, reliability diagram, OOD AUROC
- [x] Mixed-stream gatekeeping evaluation (added after the in-distribution
      comparison came out against the composite score — reported both)

## Milestone 5 — API + UI ✅
- [x] FastAPI: health, model-card, battery, demo-cases, analyze, audit
- [x] Degraded mode: serves cached demo results when weights are absent
- [x] React + Vite + Tailwind: Analyze view, Audit view
- [x] Stability-sweep signature chart; split confidence/reliability readout
- [x] Disclaimer fixed on every screen
- [x] **Fixed:** `@tailwindcss/vite` emits no utilities under Vite 8 → PostCSS
- [x] **Fixed:** `.hatch` background-image wiped by inline `background` shorthand

## Milestone 6 — polish ✅
- [x] 72 tests: perturbations, reliability math, gates, API (live + degraded)
- [x] README: setup, architecture, sources, thresholds, repro, 9 limitations
- [x] Verified end to end in the browser: demo cases, upload, error states,
      mobile layout, OOD gate

## Possible next steps (not done)
- [ ] Sweep the sub-score weights against a labelled outcome instead of fixing them
- [ ] More ensemble members — 3 makes disagreement a noisy estimate
- [ ] Multi-layer Mahalanobis, or an OOD detector not tied to one member's features
- [ ] Bootstrap confidence intervals on the band accuracies (n is small per band)
