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

## Milestone 7 — the deployment test (submission hardening) ✅
- [x] Identify the weakest link: the OOD evidence was breast ultrasound, a strawman
- [x] `shift.py` — four-arm study, pediatric → adult (NIH ChestX-ray14), CC BY 4.0
- [x] **Confound control**: pediatric films through the adult arm's exact resampling path
- [x] Two-regime table — every signal scored on in-distribution ranking AND shift detection
- [x] Threshold-free worst-case criterion after the pre-set margins excluded every signal
- [x] Divergence chart + Pareto scatter in the audit view
- [x] Adult films added to the demo deck; deck reordered to follow the demo script
- [x] `preflight.py` — live-vs-cached diff on all 13 cases, artifact sanity, narrative beats
- [x] `DEMO.md` — five-minute script with the real numbers and likely judge questions
- [x] 80 tests; 32 preflight checks

## Possible next steps (not done)
- [ ] **Learned or regime-aware weighting.** The composite detects shift at AUROC 0.796 while
      the raw embedding percentile alone reaches 0.959 — averaging dilutes the signal that
      carries the shift. This is the clearest remaining win.
- [ ] A second shift axis (scanner vendor, view position) and the reverse direction
- [ ] More ensemble members — 3 makes disagreement a noisy estimate
- [ ] Multi-layer Mahalanobis, or an OOD detector not tied to one member's features
