# ScanProof

**A deployment guardrail for a chest X-ray classifier.** Four independent checks run on every
prediction; the output is `PASS` / `REVIEW` / `BLOCK` plus the measurement behind each check.

> **Research prototype — not for diagnosis, not a medical device, no clinical validation, no
> regulatory claim.** `PASS` means no check found a reason to withhold the prediction. It is not
> evidence that the prediction is correct, and it says nothing about patient safety.

---

## The problem in one paragraph

A classifier reports 99.9% confidence on a chest X-ray. That number says how far the image sits
from the decision boundary — it cannot say whether the model has ever seen anything like this
input, because a two-class softmax is normalised over the two classes it knows and nothing else.
So a model fine-tuned on **pediatric** films stays confident when handed an **adult** film from
another hospital, and confident when handed a breast ultrasound.

ScanProof does not try to build a better confidence score. It runs four checks that fail in
different ways:

| Check | Asks | Fails when |
|---|---|---|
| **Typicality** | Has the model seen inputs like this? | the embedding sits far from the training manifold |
| **Stability** | Does the answer survive harmless changes? | the label flips under label-preserving perturbation |
| **Agreement** | Do independently trained models concur? | three checkpoints disagree |
| **Confidence** | How far from the decision boundary? | the margin is thin |

Two hard gates sit on top, and a weighted 0–100 score is available for ranking — but the thing
you act on is **which check failed**, not the number.

## Key results

All figures below are produced by `make audit` and `make shift` and committed to `artifacts/`.

**1 · The deployment test.** The ensemble is fine-tuned on pediatric chest films (ages 1–5,
Guangzhou) and then run on adult frontal chest films (NIH Clinical Center). All three numbers
are label-free — properties of the input and the model, requiring no ground truth:

| | Pediatric (n=624) | Adult (n=484) |
|---|---:|---:|
| Model confidence | 93.6% | **86.0%** |
| Embedding percentile | 50.1 | **98.4** |
| ScanProof PASS rate | 62.0% | **4.8%** |

Confidence drops 7.6 points. The typicality check moves from the middle of the training
distribution to its 98th percentile, and the guardrail withholds 95% of these inputs.

**2 · One check carried it.** Mean sub-scores, pediatric → adult: typicality 0.878 → 0.116;
agreement 0.801 → 0.619; confidence 0.892 → 0.759; stability 0.853 → 0.747. **The embedding
check did essentially all the work on this failure mode.** The other three earn their keep on
failure modes this arm does not contain — see the *Confident but fragile* and *Checkpoints
disagree* cases in the demo deck.

**3 · The confound is controlled.** The adult set is only available at 128 px without a 3.7 GB
download, so it is resampled to 224. A control arm puts the *pediatric* films through that
identical path: PASS rate Δ **+0.96 pts**, accuracy Δ **−1.1 pts**. Resolution is not what the
study measures.

**4 · The negative result, reported as found.** On in-distribution data, plain confidence is a
*better* error ranker than the composite score (AURC **0.0126** vs **0.0175**; lower is better).
Under the margins fixed before the study ran, **no signal clears both regimes — including ours.**
The margins were not relaxed afterwards.

| Signal | In-dist AURC ↓ | Shift AUROC ↑ | Worst case ↑ |
|---|---:|---:|---:|
| Model confidence | **0.0126** | 0.7479 | 0.203 |
| Perturbation instability | 0.0161 | 0.6941 | 0.000 |
| ScanProof composite | 0.0175 | 0.7955 | **0.383** |
| Ensemble disagreement | 0.0188 | 0.7113 | 0.065 |
| Embedding percentile | 0.0385 | **0.9592** | 0.000 |

What the evidence *does* support is narrower: rescale each regime so the best signal is 1 and
the worst 0, take the lower of a signal's two scores, and the composite has the best worst case
(0.383 vs 0.203). Nothing beats it on both axes at once. **Do not read this as "ScanProof beats
confidence."** It does not, in-distribution. It covers a failure mode confidence cannot see.

**5 · In-distribution behaviour is unchanged and still useful.** On the 624-image held-out
pediatric test split: accuracy 94.2%, AUROC 0.992, ECE 0.045 → 0.041 after temperature scaling.
The PASS band reaches 97.9% accuracy at 61.1% coverage; 28 of the 36 test errors fall outside it.

## Quick start

```sh
make setup       # .venv (Python 3.12) + python deps + npm install
make data        # PneumoniaMNIST + OOD probes            (~250 MB, once)
make shift-data  # adult ChestMNIST arm                   (~1.4 GB, once)
make train       # fine-tune 3 members, calibrate, fit OOD stats  (~15 min on Apple Silicon)
make audit       # select thresholds on val, evaluate on test
make shift       # the domain-shift study                 (~3 min)
make demo        # build the demo case deck
make build       # frontend
make preflight   # verify the whole demo path before recording
make serve       # http://127.0.0.1:8000
```

`make reproduce` runs all of the above in order. **`make preflight` is the one to run before a
demo** — it re-analyses every shipped case live, diffs the result against the committed cache,
refuses placeholder artifacts, and checks the narrative beats still land on their verdicts.
`DEMO.md` is the five-minute script.

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
| `shift.py` | The domain-shift study: four arms, confound control, two-regime table. |
| `preflight.py` | Demo readiness: live-vs-cached diff, artifact sanity, narrative beats. |
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

A model is fine-tuned on **pediatric** chest films (ages 1–5, Guangzhou Women and Children's
Medical Center). It is then run on **adult** frontal chest films from the NIH Clinical Center.
Both are frontal chest radiographs; the patients, the institution and the country all differ —
**and so does the label definition**, which is why this arm is a typicality test rather than an
accuracy benchmark (see below).

This is not a contrived input. It is the most common way a deployed imaging model fails, and it
is the case confidence cannot see: a two-class softmax is normalised over the two classes it
knows, so it has no state that means *"this is not my kind of input."*

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

### What it found

| Arm | n | Accuracy | Mean confidence | Embedding pct | PASS rate |
|---|---:|---:|---:|---:|---:|
| Pediatric, native | 624 | 94.2% | 94.5% | 52.4 | 61.1% |
| Pediatric, resampled *(control)* | 624 | 93.1% | 93.6% | 50.1 | 62.0% |
| **Adult, different institution** | 484 | **62.6%** | **86.0%** | **98.4** | **4.8%** |
| Breast ultrasound | 156 | — | 95.8% | 99.9 | 0.6% |

**Accuracy falls 30.5 points. Confidence falls 7.6.** The PASS rate falls from 62.0% to 4.8%.
The control arm moves the PASS rate by +0.96 points and accuracy by −1.1, so resampling is not
what produced the effect.

Confidence does not merely fail to drop — on breast ultrasound it *rises* to 95.8%, higher than
on the adult films it was at least the right modality for.

### The two-regime result, reported as found

| Signal | In-distribution AURC ↓ | Shift detection AUROC ↑ | Worst case ↑ |
|---|---:|---:|---:|
| Model confidence | **0.0126** | 0.7479 | 0.203 |
| Perturbation instability | 0.0161 | 0.6941 | 0.000 |
| ScanProof composite | 0.0175 | 0.7955 | **0.383** |
| Ensemble disagreement | 0.0188 | 0.7113 | 0.065 |
| Embedding percentile | 0.0385 | **0.9592** | 0.000 |

Margins for "acceptable in both" were fixed before the study ran (within 0.01 AURC and 0.05
AUROC of the best signal in each regime). **As measured, no signal clears both — including
ours.** That is printed on the audit page rather than smoothed over, and the margins were not
relaxed afterwards to manufacture a pass.

The claim the evidence does support is narrower and threshold-free. Rescale each regime so the
best signal scores 1 and the worst scores 0, then take the lower of a signal's two scores — the
question a deployed system actually faces, since it must commit to one number without knowing
which failure mode arrives next. On that criterion the composite leads at **0.383** against
0.203 for confidence, and the region that would beat it on both axes at once is empty.

Two honest caveats sit alongside it. The composite is a *worse* shift detector than the raw
embedding percentile (0.7955 vs 0.9592) — averaging four signals dilutes the one that carries
the shift. And ChestX-ray14 labels are NLP-mined from free-text reports and carry known noise,
so the 62.6% accuracy figure is indicative rather than a clean benchmark. Neither undercuts the
headline, which is about the model's own confidence and ScanProof's response and needs no
labels at all.

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
| `artifacts/shift_study.json` | yes | the four-arm domain-shift study and the two-regime table |
| `artifacts/audit_cases.json` | no | 624 per-case rows; regenerate with `make audit` |
| `artifacts/shift_cases.json` | no | per-case rows for the adult arm; regenerate with `make shift` |
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
6. **Weights are a judgement call, and the shift study exposes the cost.** The
   0.20/0.40/0.25/0.15 split was fixed a priori. Averaging four signals dilutes the one that
   carries a distribution shift: the composite detects the adult arm at AUROC 0.7955 while the
   raw embedding percentile alone reaches 0.9592. A learned or regime-aware weighting would
   very likely beat this, and that is the clearest next step.
7. **The adult arm's labels are noisy.** ChestX-ray14 labels are NLP-mined from free-text
   reports. The 62.6% accuracy figure is indicative, not a clean benchmark. The claims that
   matter do not rest on it.
8. **One shift axis, one direction.** Pediatric → adult, one source hospital → one other. It
   says nothing about scanner vendor, view position, or the reverse direction.
9. **Three checkpoints is a small ensemble.** Disagreement is a noisy estimate; more members
   would sharpen it at linear cost.
10. **Thresholds come from 524 validation images.** The selected values carry real sampling
    variance, and the adult arm is 484 images — the bootstrap CIs in `shift_study.json` are the
    honest width of these estimates.
11. **No temporal or site-level validation**, no comparison against reader performance, no
    prospective evaluation. None of the standard evidence a clinical claim would require.

## Judge FAQ

**Why not use confidence alone?**
Because confidence is a distance to a decision boundary, and a two-class softmax has no state in
which to say "this input is unlike my training data" — the two probabilities are normalised to
sum to 1 no matter what you feed it. Measured: on adult films the mean confidence is 86.0%, and
on breast ultrasound it is 95.8% — *higher* than on the adult chest films. Confidence is a good
in-distribution error ranker (AURC 0.0126, the best of the five signals we tested) and blind to
this failure mode.

**Why not use only the embedding detector?**
It is the best shift detector we measured (AUROC 0.9592) and the *worst* in-distribution error
ranker (AURC 0.0385, versus 0.0126 for confidence). A guardrail built only from embedding
distance would wave through the genuinely hard in-distribution cases. See *Confident but fragile*
in the demo deck: typicality is fine, and the label flips under a gamma change.

**Why combine signals if the composite is weaker on some metrics?**
It *is* weaker, and we say so on the audit page. Under margins fixed before the study ran, no
signal clears both regimes — including ours. The defensible claim is threshold-free: rescale each
regime so the best signal scores 1 and the worst 0, then take the lower of a signal's two scores.
The composite has the best worst case (0.383 vs 0.203 for confidence), and nothing beats it on
both axes at once. In practice you do not ship a scalar anyway — you ship four checks and two
gates, and the verdict tells you which one fired.

**Why ChestMNIST?**
Because it is the shift that actually happens: same imaging modality, same anatomy, same
projection, different hospital and a different patient population. Breast ultrasound is in the
study too, as the extreme fourth arm, but nobody deploys a chest X-ray model on ultrasound by
accident — everybody deploys it on someone else's patients. ChestMNIST is also CC BY 4.0,
fetchable through the same `medmnist` API, and MD5-verified, so the arm is reproducible with one
command.

*The obvious objection — "adults and children look different, of course an embedding detector
notices" — is the point, not a flaw.* The difference is plainly visible in the image, it is
detectable at AUROC 0.9592, and the classifier's own confidence still does not detect it.

**What does PASS actually mean?**
"None of the four checks found a reason to withhold this prediction." That is all. It is not
evidence the prediction is correct: on the held-out test split the PASS band is 97.9% accurate,
so 8 of 381 passed cases are still wrong, and the demo deck ships one of them on purpose
(*Confidently wrong — missed*). PASS is the absence of a detected problem, not the presence of
a guarantee.

**Does ScanProof establish clinical safety?**
No. It is a research prototype on public benchmark data. There is no clinical validation, no
prospective evaluation, no reader study, no regulatory clearance, and no claim to any of those.
The training data is 28×28-derived, pediatric, single-source and binary; none of the conclusions
transfer to full-resolution DICOM without re-validation.

**How were thresholds selected?**
`python -m scanproof.evaluate` selects them on the **524-image pediatric validation split** and
writes them to `artifacts/reliability_config.json`. The rule is the stricter of two constraints:
the lowest score whose PASS band reaches 99% selective accuracy, and the quantile capping PASS
coverage at 70%. The coverage cap is load-bearing — the ensemble nearly saturates validation, so
an accuracy target alone would be met by passing everything. The result was PASS ≥ 97.09,
REVIEW ≥ 84.04, and those values were frozen before any test or shift arm was scored.

**What prevents test-set leakage?**
Three things, in order of importance. (1) Thresholds and the temperature scalars are fit on the
validation split only; the 624-image test split is scored once, afterwards. (2) `scanproof.shift`
loads `reliability_config.json` and re-tunes nothing — the study cannot move a threshold even if
it wanted to. (3) The Mahalanobis statistics are fit on **training** features only. The margins
used to judge "acceptable in both regimes" were also fixed in `config.py` before the shift study
ran, and when the result came back negative they were left alone and the negative result was
published instead.

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
