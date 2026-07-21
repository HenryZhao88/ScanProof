# ScanProof

**Research prototype — not for diagnosis.** ScanProof is not a medical device, has no
clinical validation, and makes no regulatory claim. A `PASS` verdict means a prediction
survived a battery of controlled tests. It does not mean the prediction is correct, and it
does not mean anything about patient safety.

---

A chest X-ray classifier reports 97% confidence. Is that prediction reliable?

Confidence answers "how far is this from my decision boundary", which is not the same
question. ScanProof measures the second question directly: it perturbs the image in ways
that cannot change the finding, asks three independently-trained checkpoints, and checks
whether the image resembles anything the model was trained on. If the prediction moves, the
confidence was never worth much.

The output is a 0–100 reliability score, a `PASS` / `REVIEW` / `BLOCK` verdict, and an
evidence ledger where every deducted point is attributable to a named measurement — *"the
label flips to NORMAL under Brightness +24%"*, not *"low reliability"*.

## Quick start

```sh
make setup       # .venv (Python 3.12) + python deps + npm install
make data        # download PneumoniaMNIST + OOD probes  (~250 MB, once)
make train       # fine-tune 3 members, calibrate, fit OOD stats  (~15 min on Apple Silicon)
make audit       # select thresholds on val, evaluate on test, write artifacts/
make demo        # build the demo case deck
make serve       # http://127.0.0.1:8000
```

`make reproduce` runs all of the above in order.

For frontend work, `make dev` runs the API on `:8000` and Vite on `:5173` with a proxy.
Requires Python 3.10–3.13 (PyTorch), Node 18+, and [`uv`](https://docs.astral.sh/uv/).
Apple Silicon (MPS) and CUDA are used when present; CPU works and is slower.

**The demo path makes no network calls.** Fonts are vendored into the bundle, the frontend
is served by the same FastAPI process as the API, and all model and dataset assets are
local after `make data` / `make train`.

## Architecture

```
                    ┌──────────────────────────────────────────────┐
 image (uint8 224²) │  perturbations.py   7 families × 3 severities│
        │           │                     deterministic, mild      │
        ▼           └──────────────────────────────────────────────┘
   pipeline.py ──── 22 images (1 clean + 21 variants)
        │
        ├──► models.py    3 members  ──► logits ──► temperature ──► probs
        │                    │
        │                    └── penultimate features ──► ood.py (Mahalanobis)
        ▼
  reliability.py   4 sub-scores → weighted score → bands → gates → evidence
        │
        ├──► api.py       FastAPI, serves the built SPA on one port
        └──► evaluate.py  offline audit → artifacts/*.json → Audit view
```

Each module is independently testable and has one job:

| Module | Responsibility |
|---|---|
| `config.py` | Paths, ensemble composition, weights, thresholds. One place to audit the formula. |
| `data.py` | MedMNIST download, splits, the `uint8 → tensor` path shared by training and serving. |
| `models.py` | Member definition, weight loading, logits and embeddings. |
| `calibration.py` | Temperature scaling; ECE, Brier, NLL. |
| `perturbations.py` | The test battery. Pure functions on `uint8` arrays. |
| `ood.py` | Class-conditional Mahalanobis fit + percentile lookup. |
| `reliability.py` | Signals → sub-scores → score → verdict → evidence. No I/O, no torch. |
| `pipeline.py` | Batches the forward passes; `Measurement` → `ReliabilityResult`. |
| `evaluate.py` | Threshold selection on val, metrics on test, writes `artifacts/`. |
| `demo.py` | Selects archetype cases from the audit, writes `demo_cases/`. |
| `api.py` | HTTP surface. Degrades to cached results if weights are absent. |

`reliability.py` imports no torch and does no I/O — the scoring logic can be tested with
plain arrays, which is why the gate and arithmetic tests run in milliseconds.

## Data and model sources

| Asset | Source | License | Accessed |
|---|---|---|---|
| **PneumoniaMNIST** (5,856 pediatric chest X-rays, binary) — train/val/test | [medmnist.com](https://medmnist.com/) · [Zenodo 10519652](https://zenodo.org/records/10519652) | CC BY 4.0 | 2026-07-29 |
| **ChestMNIST** (NIH ChestX-ray14, adult) — domain-shift arm only | same | CC BY 4.0 | 2026-07-29 |
| **BreastMNIST** (780 breast ultrasound images) — OOD arm only | same | CC BY 4.0 | 2026-07-29 |
| **ResNet-18, DenseNet-121** ImageNet weights | torchvision `IMAGENET1K_V1` | BSD-3-Clause | 2026-07-29 |

Both datasets are fetched reproducibly through the official `medmnist` package API, which
verifies MD5s against the Zenodo record. Nothing is scraped. MedMNIST images are
de-identified, pre-processed and published by the dataset authors; no private, identifiable
or ambiguously-licensed medical data is used anywhere in this repository.

PneumoniaMNIST derives from Kermany et al., *"Identifying medical diagnoses and treatable
diseases by image-based deep learning"*, **Cell** 176(2), 2018. ChestMNIST derives from Wang et
al., *"ChestX-ray8: Hospital-scale chest X-ray database and benchmarks…"*, **CVPR** 2017.

> Yang, J., Shi, R., Wei, D., Liu, Z., Zhao, L., Ke, B., Pfister, H., Ni, B.
> "MedMNIST v2 — A large-scale lightweight benchmark for 2D and 3D biomedical image
> classification." *Scientific Data* 10, 41 (2023).

Methods referenced: temperature scaling from Guo et al. (ICML 2017); Mahalanobis OOD
detection from Lee et al. (NeurIPS 2018). Both are re-implemented here from their published
descriptions, not copied.

**A note on the splits.** MedMNIST builds PneumoniaMNIST's train/val splits from the source
*training* collection and uses the source *validation* collection as the test split. Test is
therefore genuinely shifted: the ensemble scores ~98% on validation and materially lower on
test. That shift is not a defect — it is what makes this a useful reliability benchmark,
because there are real errors for the signals to catch.

## The central experiment: the deployment test

Everything above is context for one question. `make shift` answers it.

A model is fine-tuned on **pediatric** chest films from one hospital in Guangzhou. It is then
run on **adult** chest films from the NIH Clinical Center — same modality, same view, same
question, different patients and different scanners. This is not a contrived input. It is the
single most common way a deployed imaging model fails, and it is the case confidence cannot
see: a two-class softmax is normalised over the two classes it knows, so it has no way to
represent *"this is not my kind of input."*

Four arms, ordered by distance from the training distribution:

| Arm | Data | Purpose |
|---|---|---|
| `in_distribution` | PneumoniaMNIST test, native 224 | the population the model was fine-tuned on |
| `resolution_control` | the same films, 128 → 224 | **confound control** — identical resampling to the adult arm |
| `domain_shift` | ChestMNIST, pneumonia vs no-finding, balanced | adult films, different institution |
| `wrong_modality` | BreastMNIST | breast ultrasound; the extreme end |

**The confound control is load-bearing.** ChestMNIST is only available at 224 as a 3.7 GB
archive, so the adult arm is built from the native 128 rendering and resampled to 224. Arm 2
puts the *pediatric* films through that exact path. If arms 1 and 2 disagreed, the study would
be measuring image processing rather than population, and the result would be worthless. They
are compared explicitly, in the artifact and on screen.

Two headline metrics come out of it:

1. **Shift detection AUROC.** Treat "is this input from a population the model was not trained
   on?" as a detection problem and score each candidate signal with one scalar. A signal that
   carries no shift information lands at 0.5.
2. **The two-regime table.** A deployed system gets *one* number to decide whether to trust a
   prediction, and two different things can go wrong — an ordinary hard case (regime A,
   selective-prediction AURC, lower better) and an input from the wrong distribution (regime B,
   detection AUROC, higher better). Every signal is scored in both. The question is not which
   signal wins a regime; it is whether any single signal is acceptable in **both**.

Nothing in this study re-tunes a threshold. The PASS/REVIEW cut points were frozen by
`make audit` on the pediatric validation split before it ran.

## Reliability components

Four sub-scores, each in `[0,1]`, combined by fixed weights (`config.WEIGHTS`):

| Sub-score | Weight | What it measures | Zero when |
|---|---|---|---|
| `confidence` | 0.20 | Calibrated margin of the predicted class | confidence ≤ 0.50; saturates at 0.95 |
| `stability` | 0.40 | Survival of the perturbation battery | 25% of variants flip, or mean \|Δp\| ≥ 0.25 |
| `agreement` | 0.25 | Spread across three checkpoints | σ of P(pneumonia) ≥ 0.25; capped at 0.35 on a split vote |
| `typicality` | 0.15 | Embedding distance from the training manifold | at the 100th percentile; decay starts at the 90th |

`score = 100 × Σ wᵢ · subscoreᵢ`, then banded, then two hard gates:

- **OOD gate** — embedding percentile ≥ 99.5 forces `BLOCK`. The model has no comparable
  training examples, so its output is not interpretable at any confidence.
- **Fragility gate** — a class flip at the *mildest* severity caps the verdict at `REVIEW`.
- **Split-vote backstop** — a checkpoint disagreement can never reach `PASS`. In practice the
  agreement sub-score already handles this; the gate keeps the guarantee true under retuning.

Gates override the weighted score deliberately: a failure this specific should not be
averaged away by good numbers elsewhere.

### The perturbation battery

Seven families × three severities = 21 variants, all deterministic (fixed noise seed per
variant), all label-preserving — no radiologist would report a different finding.

| Family | Severities | Stands in for |
|---|---|---|
| Brightness | +12% / +24% / +36% | exposure shift |
| Contrast | −15% / −28% / −40% | windowing |
| Gamma | 1.25 / 1.55 / 1.90 | display transfer curve |
| Detector noise | σ 0.02 / 0.045 / 0.08 | sensor noise |
| Blur | σ 0.8 / 1.6 / 2.6 px | focus or motion softness |
| Rotation | 3° / 6° / 10° | patient or detector rotation |
| Resolution loss | 0.70× / 0.50× / 0.35× | lossy storage, lower-resolution acquisition |

Rotation is reflect-padded: black corners would be their own out-of-distribution cue and
would confound the stability signal with the typicality one.

### Thresholds

Not hand-picked. `python -m scanproof.evaluate` selects them on the **validation** split and
writes `artifacts/reliability_config.json`; the test split is never used to choose anything.

- `review_threshold` = the score quantile placing 12% of validation in `BLOCK`.
- `pass_threshold` = the stricter of **(a)** the lowest score whose `PASS` band reaches 99%
  selective accuracy, and **(b)** the quantile capping `PASS` coverage at 70%.

The coverage cap is load-bearing. The ensemble nearly saturates validation, so an accuracy
target alone is satisfied by passing everything and the verdict stops discriminating.
Reserving a fixed share for `REVIEW`/`BLOCK` is the standard selective-prediction answer.

## How the metrics are generated

Every number in the Audit view comes from `artifacts/audit_summary.json`, written by
`make audit`. Nothing is typed in by hand.

```sh
make audit    # python -m scanproof.evaluate
```

| Artifact | Committed | Contents |
|---|---|---|
| `artifacts/calibration.json` | yes | per-member val accuracy/AUROC, fitted temperature, ECE before and after, training history |
| `artifacts/reliability_config.json` | yes | chosen thresholds, the rule, and the validation sweep that justified them |
| `artifacts/audit_summary.json` | yes | everything the Audit view renders |
| `artifacts/audit_cases.json` | no | 624 per-case rows; regenerate with `make audit` |
| `demo_cases/manifest.json` + PNGs | yes | the demo deck and its cached results |

The audit reports: accuracy / AUROC / sensitivity / specificity, ECE-Brier-NLL before and
after calibration with a real reliability diagram, accuracy and coverage per verdict band,
risk–coverage curves ranked by reliability score **and** by confidence alone (the direct test
of the product thesis), per-family per-severity robustness, and OOD detection AUROC against a
different imaging modality.

Demo cases are cached, but the cache is written by the same `Analyzer` the live API uses, and
the API recomputes them live when weights are present. The pipeline is deterministic, so the
two agree.

## Testing

```sh
make test
```

Covers perturbation determinism, severity monotonicity, structure preservation, output
ranges, sub-score arithmetic, every gate, and API behaviour in both live and degraded mode.

## Known limitations

Stated plainly, because a reliability tool that oversells itself is self-defeating.

1. **PASS is not a correctness guarantee.** Errors still reach the PASS band; the audit view
   prints how many. ScanProof narrows the failure rate, it does not eliminate it.
2. **28×28-derived data.** PneumoniaMNIST is centre-cropped and resampled from full-resolution
   films. Findings that depend on fine detail or on the periphery are gone before the model
   sees anything. Conclusions do not transfer to full-resolution DICOM without re-validation.
3. **Pediatric, single-source, binary.** One collection, one age group, two classes. Real
   reporting is multi-label, multi-institution, and includes priors and clinical context.
4. **Naturalistic corruption only.** The battery covers benign acquisition variation. It says
   nothing about adversarial robustness, which is a different and much more expensive question.
5. **Single-layer Mahalanobis.** Weaker than multi-layer or ensembled OOD detectors, and it
   inherits whatever biases sit in `m0-resnet18`'s feature space. Chosen because it needs no
   OOD data at fit time and runs in one forward pass.
6. **Weights are a judgement call.** The 0.20/0.40/0.25/0.15 split reflects a view that
   instability is the strongest signal available without labels. It is not learned, and
   sweeping it against a labelled outcome would be the obvious next step.
7. **Three checkpoints is a small ensemble.** Disagreement is a noisy estimate; more members
   would sharpen it at linear cost.
8. **Thresholds come from 524 validation images.** The selected values carry real sampling
   variance.
9. **No temporal or site-level validation**, no comparison against reader performance, no
   prospective evaluation. None of the standard evidence a clinical claim would require.

## Repository layout

```
scanproof/      Python package — inference, reliability, evaluation, API
frontend/       Vite + React + TypeScript + Tailwind v4
tests/          pytest suite
artifacts/      generated JSON, committed (small, traceable)
demo_cases/     PNGs + manifest with cached results, committed
data/           datasets (git-ignored, reproducible via `make data`)
models/         weights + OOD stats (git-ignored, reproducible via `make train`)
```

Datasets, model weights, caches, build output and virtualenvs are git-ignored. What is
committed is source, configuration, and small generated artifacts that are traceable to the
command that produced them.

## License

Code: MIT. Data: CC BY 4.0 (MedMNIST), attributed above. Pretrained weights: BSD-3-Clause
(torchvision).
