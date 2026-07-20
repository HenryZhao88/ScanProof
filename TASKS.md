# ScanProof — running task list

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## Milestone 1 — foundation
- [x] Inspect folder / establish brief (folder was empty; task prompt is the brief)
- [x] Verify dataset license + provenance (PneumoniaMNIST, MedMNIST v2, CC BY 4.0)
- [x] Init git on `main`
- [~] Python 3.12 venv + deps (torch, torchvision, medmnist, fastapi, sklearn)
- [ ] Project skeleton + `.gitignore`

## Milestone 2 — model
- [ ] `data.py` — MedMNIST download/loaders + OOD probe set
- [ ] `models.py` — 3-member heterogeneous ensemble (resnet18 ×2, efficientnet_b0)
- [ ] `train.py` — fine-tune members, save weights
- [ ] `calibration.py` — temperature scaling on val split, ECE before/after

## Milestone 3 — reliability engine
- [ ] `perturbations.py` — 6 families × 3 severities, deterministic
- [ ] `ood.py` — class-conditional Mahalanobis on penultimate features → percentile
- [ ] `reliability.py` — 4 subscores → score + PASS/REVIEW/BLOCK + evidence items
- [ ] `pipeline.py` — single-image end-to-end analyze()
- [ ] Threshold selection on **validation** split (not test)

## Milestone 4 — evaluation + artifacts
- [ ] `evaluate.py` — full test-set audit → committed JSON artifacts
- [ ] Selective-prediction table (accuracy/coverage per reliability band)
- [ ] Robustness curves, risk–coverage curve, ECE

## Milestone 5 — API + UI
- [ ] FastAPI: `/api/analyze`, `/api/demo-cases`, `/api/audit`, `/api/health`
- [ ] React + Vite + Tailwind: Analyze view, Audit view
- [ ] Demo case gallery with cached results
- [ ] Disclaimer banner on all screens

## Milestone 6 — polish
- [ ] Tests (pytest) for perturbations, reliability math, API
- [ ] README: setup, architecture, data sources, repro commands, thresholds, limitations
- [ ] End-to-end demo dry run
