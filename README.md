# ScanProof

A chest X-ray classifier tells you it's 99.9% sure. ScanProof tells you whether that number is
worth anything.

Four independent checks run on every prediction. You get `PASS`, `REVIEW`, or `BLOCK`, plus the
measurement behind each check, so you can see which one objected and why.

> **Research prototype — not for diagnosis.** No clinical validation, no regulatory claim, not a
> medical device. `PASS` means none of the four checks found a reason to withhold the prediction.
> It is not evidence that the prediction is correct, and it says nothing about patient safety.

---

## Why confidence isn't enough

A two-class softmax has to spread its probability across the two classes it knows. Feed it
something it has never seen and it doesn't get quieter — it just picks a side. There's no output
slot that means *"I don't recognise this."*

So our model, fine-tuned on pediatric chest films from one hospital, reports 86.0% mean
confidence on adult films from a different one. On breast ultrasound it reports 95.8%. Higher on
the ultrasound than on the chest X-rays. It has no way to tell you it's out of its depth, because
nothing in the architecture can represent that.

ScanProof doesn't try to build a better confidence score. It runs four checks that fail for
different reasons:

| Check | Asks | Fails when |
|---|---|---|
| **Typicality** | Has the model seen inputs like this? | the embedding sits far from the training manifold |
| **Stability** | Does the answer survive harmless edits? | the label flips under a label-preserving perturbation |
| **Agreement** | Do independently trained models concur? | three checkpoints disagree |
| **Confidence** | How far from the decision boundary? | the margin is thin |

Two hard gates sit on top, and there's a weighted 0–100 score for ranking. But the thing you act
on is *which check failed*, not the number.

## What we found

Every figure below comes out of `make audit` and `make shift` and is committed under
`artifacts/`. Nothing is typed in by hand, and `pytest tests/test_claims.py` fails if this file
drifts from the artifacts.

### The deployment test

Train on children, run on adults. It's the most ordinary way a deployed imaging model breaks: not
a weird input, just somebody else's patients.

The ensemble is fine-tuned on pediatric chest films (ages 1–5, Guangzhou Women and Children's
Medical Center) and then run on adult frontal chest films from the NIH Clinical Center. Same
modality, same anatomy, same projection. Different patients, different institution, different
country.

| | Pediatric (n=624) | Adult (n=484) |
|---|---:|---:|
| Model confidence | 93.6% | **86.0%** |
| Embedding percentile | 50.1 | **98.4** |
| ScanProof PASS rate | 62.0% | **4.8%** |

Confidence drops 7.6 points, which is nowhere near enough to notice in production. The typicality
check goes from the middle of the training distribution to its 98th percentile, and the guardrail
withholds 95% of these inputs.

All three of those numbers are label-free. They're properties of the input and the model, so you
can compute them on a live stream where nobody has told you the right answer yet. That matters
more than it sounds: the whole point is catching the problem *before* the accuracy report exists.

### One check did the work, and that's fine

Mean sub-scores, pediatric → adult: typicality 0.878 → 0.116, agreement 0.801 → 0.619, confidence
0.892 → 0.759, stability 0.853 → 0.747.

The embedding check carried this one almost single-handed. We're not going to dress that up as a
team effort. The other three exist because they catch things this arm doesn't contain — see
*Confident but fragile* and *Checkpoints disagree* in the demo deck, where typicality is perfectly
happy and the prediction is still not safe to use.

### The confound is controlled

The adult set is only available at 128 px unless you download 3.7 GB, so it gets resampled to
224. That's a real confound: maybe we're just detecting resampling.

So there's a control arm that puts the *pediatric* films through the identical path. PASS rate
moves by **+0.96 points**, accuracy by **−1.1 points**. Resolution isn't what the study is
measuring.

### The negative result

On in-distribution data, plain confidence is a **better** error ranker than our composite score:
AURC **0.0126** against **0.0175**, lower is better. We're reporting that because it's true.

| Signal | In-dist AURC ↓ | Shift AUROC ↑ | Worst case ↑ |
|---|---:|---:|---:|
| Model confidence | **0.0126** | 0.7479 | 0.203 |
| Perturbation instability | 0.0161 | 0.6941 | 0.000 |
| ScanProof composite | 0.0175 | 0.7955 | **0.383** |
| Ensemble disagreement | 0.0188 | 0.7113 | 0.065 |
| Embedding percentile | 0.0385 | **0.9592** | 0.000 |

We fixed margins for "acceptable in both regimes" before running the study (within 0.01 AURC and
0.05 AUROC of the best signal in each). As measured, **no signal clears both — ours included.**
We didn't go back and loosen the margins afterwards, and the failure is printed on the audit page
rather than buried here.

What the evidence does support is narrower. Rescale each regime so the best signal scores 1 and
the worst 0, then take the *lower* of a signal's two scores. That's the question a deployed system
actually faces, since it has to commit to one number without knowing which kind of failure shows
up next. On that criterion the composite leads at **0.383** against 0.203 for confidence, and
nothing beats it on both axes at once.

Please don't read that as "ScanProof beats confidence." It doesn't, in-distribution. It covers a
failure mode confidence can't see.

### In-distribution behaviour still holds up

On the 624-image held-out pediatric test split: accuracy 94.2%, AUROC 0.992, ECE 0.045 → 0.041
after temperature scaling. The PASS band reaches 97.9% accuracy at 61.1% coverage,
and 28 of the 36 test errors land outside it.

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

`make reproduce` runs all of that in order.

If you're about to demo this, run `make preflight` first. It re-analyses every shipped case live,
diffs the result against the committed cache, refuses placeholder artifacts, and checks that the
narrative beats still land on the verdicts the script claims they do. `DEMO.md` is the five-minute
walkthrough.

For frontend work, `make dev` runs the API on `:8000` and Vite on `:5173` with a proxy. You'll
need Python 3.10–3.13 (PyTorch), Node 18+, and [`uv`](https://docs.astral.sh/uv/). Apple Silicon
(MPS) and CUDA are used when present; CPU works and is slower.

**The demo path makes no network calls.** Fonts are vendored into the bundle, the frontend is
served by the same FastAPI process as the API, and every model and dataset asset is local once
`make data` and `make train` have run.

## How it fits together

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

Every module does one job and can be tested on its own:

| Module | Responsibility |
|---|---|
| `config.py` | Paths, ensemble composition, weights, thresholds. One place to audit the formula. |
| `data.py` | MedMNIST download, splits, and the `uint8 → tensor` path shared by training and serving. |
| `models.py` | Member definition, weight loading, logits and embeddings. |
| `calibration.py` | Temperature scaling; ECE, Brier, NLL. |
| `perturbations.py` | The test battery. Pure functions on `uint8` arrays. |
| `ood.py` | Class-conditional Mahalanobis fit and percentile lookup. |
| `reliability.py` | Signals → sub-scores → score → verdict → evidence. |
| `pipeline.py` | Batches the forward passes; `Measurement` → `ReliabilityResult`. |
| `evaluate.py` | Threshold selection on val, metrics on test, writes `artifacts/`. |
| `shift.py` | The domain-shift study: four arms, confound control, two-regime table. |
| `preflight.py` | Demo readiness: live-vs-cached diff, artifact sanity, narrative beats. |
| `demo.py` | Picks archetype cases out of the audit, writes `demo_cases/`. |
| `api.py` | HTTP surface. Falls back to cached results when weights are absent. |

`reliability.py` imports no torch and touches no disk, which is why the gate and arithmetic tests
run in milliseconds — the scoring logic is testable with plain arrays.

## The deployment test in detail

`make shift` runs four arms, ordered by distance from the training distribution:

| Arm | Data | Purpose |
|---|---|---|
| `in_distribution` | PneumoniaMNIST test, native 224 | the population the model was fine-tuned on |
| `resolution_control` | the same films, 128 → 224 | confound control, identical resampling to the adult arm |
| `domain_shift` | ChestMNIST, pneumonia vs no-finding, balanced | adult films, different institution |
| `wrong_modality` | BreastMNIST | breast ultrasound, the extreme end |

The control arm is load-bearing. If arms 1 and 2 disagreed, the study would be measuring image
processing rather than patient population and the whole thing would be worthless. They're compared
explicitly, in the artifact and on screen.

| Arm | n | Accuracy | Mean confidence | Embedding pct | PASS rate |
|---|---:|---:|---:|---:|---:|
| Pediatric, native | 624 | 94.2% | 94.5% | 52.4 | 61.1% |
| Pediatric, resampled *(control)* | 624 | 93.1% | 93.6% | 50.1 | 62.0% |
| **Adult, different institution** | 484 | **62.6%** | **86.0%** | **98.4** | **4.8%** |
| Breast ultrasound | 156 | — | 95.8% | 99.9 | 0.6% |

Accuracy falls 30.5 points. Confidence falls 7.6. And on breast ultrasound confidence doesn't
just fail to drop, it *rises* to 95.8% — higher than on the adult films, which were at least the
right modality.

Two metrics come out of this:

**Shift detection AUROC.** Treat "is this input from a population the model wasn't trained on?"
as a detection problem and score each candidate signal with one scalar. A signal carrying no
shift information lands at 0.5.

**The two-regime table.** A deployed system gets *one* number to decide whether to trust a
prediction, and two different things can go wrong: an ordinary hard case (regime A, selective
prediction, AURC, lower better) or an input from the wrong distribution (regime B, detection,
AUROC, higher better). Every signal is scored in both. The interesting question isn't which signal
wins a regime — it's whether any single signal is acceptable in **both**.

Nothing in the study re-tunes a threshold. The PASS/REVIEW cut points were frozen by `make audit`
on the pediatric validation split before it ran.

Two caveats belong next to the result. The composite is a *worse* shift detector than the raw
embedding percentile (0.7955 vs 0.9592) — averaging four signals dilutes the one carrying the
signal you want. And ChestX-ray14 labels are NLP-mined from free-text reports and carry known
noise, so the 62.6% accuracy figure is indicative rather than a clean benchmark. Neither one
touches the headline, which is about the model's own confidence and ScanProof's response, and
needs no labels at all.

## How the score is built

Four sub-scores, each in `[0,1]`, combined with fixed weights (`config.WEIGHTS`):

| Sub-score | Weight | What it measures | Zero when |
|---|---|---|---|
| `confidence` | 0.20 | Calibrated margin of the predicted class | confidence ≤ 0.50; saturates at 0.95 |
| `stability` | 0.40 | Survival of the perturbation battery | 25% of variants flip, or mean \|Δp\| ≥ 0.25 |
| `agreement` | 0.25 | Spread across three checkpoints | σ of P(pneumonia) ≥ 0.25; capped at 0.35 on a split vote |
| `typicality` | 0.15 | Embedding distance from the training manifold | at the 100th percentile; decay starts at the 90th |

`score = 100 × Σ wᵢ · subscoreᵢ`, then banded, then two hard gates:

- **OOD gate.** Embedding percentile ≥ 99.5 forces `BLOCK`. The model has no comparable training
  examples, so its output isn't interpretable at any confidence.
- **Fragility gate.** A class flip at the *mildest* severity caps the verdict at `REVIEW`.
- **Split-vote backstop.** A checkpoint disagreement can never reach `PASS`. The agreement
  sub-score already handles this in practice; the gate keeps the guarantee true if anyone retunes
  the weights.

The gates override the weighted score on purpose. A failure this specific shouldn't get averaged
away by good numbers elsewhere.

### The perturbation battery

Seven families × three severities = 21 variants, all deterministic (fixed noise seed per variant)
and all label-preserving. No radiologist would report a different finding on any of them.

| Family | Severities | Stands in for |
|---|---|---|
| Brightness | +12% / +24% / +36% | exposure shift |
| Contrast | −15% / −28% / −40% | windowing |
| Gamma | 1.25 / 1.55 / 1.90 | display transfer curve |
| Detector noise | σ 0.02 / 0.045 / 0.08 | sensor noise |
| Blur | σ 0.8 / 1.6 / 2.6 px | focus or motion softness |
| Rotation | 3° / 6° / 10° | patient or detector rotation |
| Resolution loss | 0.70× / 0.50× / 0.35× | lossy storage, lower-resolution acquisition |

Rotation is reflect-padded. Black corners would be an out-of-distribution cue in their own right
and would confound the stability signal with the typicality one.

### Thresholds

Not hand-picked. `python -m scanproof.evaluate` selects them on the **validation** split and
writes `artifacts/reliability_config.json`. The test split is never used to choose anything.

- `review_threshold` — the score quantile that puts 12% of validation in `BLOCK`.
- `pass_threshold` — the stricter of **(a)** the lowest score whose `PASS` band reaches 99%
  selective accuracy, and **(b)** the quantile capping `PASS` coverage at 70%.

That coverage cap does real work. The ensemble nearly saturates validation, so an accuracy target
on its own is satisfied by passing everything, at which point the verdict stops discriminating.
Reserving a fixed share for `REVIEW`/`BLOCK` is the standard selective-prediction answer.

## Where the numbers come from

Everything in the Audit view is read from `artifacts/audit_summary.json`, written by `make audit`.

| Artifact | Committed | Contents |
|---|---|---|
| `artifacts/calibration.json` | yes | per-member val accuracy/AUROC, fitted temperature, ECE before and after, training history |
| `artifacts/reliability_config.json` | yes | chosen thresholds, the rule, and the validation sweep that justified them |
| `artifacts/audit_summary.json` | yes | everything the Audit view renders |
| `artifacts/shift_study.json` | yes | the four-arm domain-shift study and the two-regime table |
| `artifacts/audit_cases.json` | no | 624 per-case rows; regenerate with `make audit` |
| `artifacts/shift_cases.json` | no | per-case rows for the adult arm; regenerate with `make shift` |
| `demo_cases/manifest.json` + PNGs | yes | the demo deck and its cached results |

The audit reports accuracy, AUROC, sensitivity and specificity; ECE, Brier and NLL before and
after calibration with a real reliability diagram; accuracy and coverage per verdict band;
risk–coverage curves ranked by reliability score **and** by confidence alone (the direct test of
the product thesis); per-family per-severity robustness; and OOD detection AUROC against a
different imaging modality.

Demo cases are cached, but the cache is written by the same `Analyzer` the live API uses, and the
API recomputes them live whenever weights are present. The pipeline is deterministic, so the two
agree — and `make preflight` proves it rather than assuming it.

## Data and model sources

| Asset | Source | License | Accessed |
|---|---|---|---|
| **PneumoniaMNIST** (5,856 pediatric chest X-rays, binary) — train/val/test | [medmnist.com](https://medmnist.com/) · [Zenodo 10519652](https://zenodo.org/records/10519652) | CC BY 4.0 | 2026-07-29 |
| **ChestMNIST** (NIH ChestX-ray14, adult) — domain-shift arm only | same | CC BY 4.0 | 2026-07-29 |
| **BreastMNIST** (780 breast ultrasound images) — OOD arm only | same | CC BY 4.0 | 2026-07-29 |
| **ResNet-18, DenseNet-121** ImageNet weights | torchvision `IMAGENET1K_V1` | BSD-3-Clause | 2026-07-29 |

Both datasets are fetched through the official `medmnist` package API, which verifies MD5s against
the Zenodo record. Nothing is scraped. MedMNIST images are de-identified, pre-processed and
published by the dataset authors. No private, identifiable or ambiguously-licensed medical data is
used anywhere in this repository.

PneumoniaMNIST derives from Kermany et al., *"Identifying medical diagnoses and treatable diseases
by image-based deep learning"*, **Cell** 176(2), 2018. ChestMNIST derives from Wang et al.,
*"ChestX-ray8: Hospital-scale chest X-ray database and benchmarks…"*, **CVPR** 2017.

> Yang, J., Shi, R., Wei, D., Liu, Z., Zhao, L., Ke, B., Pfister, H., Ni, B.
> "MedMNIST v2 — A large-scale lightweight benchmark for 2D and 3D biomedical image
> classification." *Scientific Data* 10, 41 (2023).

Temperature scaling comes from Guo et al. (ICML 2017) and Mahalanobis OOD detection from Lee et
al. (NeurIPS 2018). Both are re-implemented here from the published descriptions, not copied.

**One thing worth knowing about the splits.** MedMNIST builds PneumoniaMNIST's train and val
splits from the source *training* collection, and uses the source *validation* collection as the
test split. So test is genuinely shifted: the ensemble scores ~98% on validation and materially
lower on test. That's not a defect for our purposes. It's what makes this a useful reliability
benchmark, because there are real errors left for the signals to catch.

## Testing

```sh
make test
```

Covers perturbation determinism, severity monotonicity, structure preservation, output ranges,
sub-score arithmetic, every gate, and API behaviour in both live and degraded mode.
`tests/test_claims.py` parses the numbers back out of this README, `DEVPOST.md` and `VIDEO.md` and
compares them to the artifacts, so re-running a study can't quietly leave stale figures in the
copy.

## What this doesn't do

1. **`PASS` is not a correctness guarantee.** Errors still reach the PASS band and the audit view
   prints how many. ScanProof narrows the failure rate. It doesn't eliminate it.
2. **The data is 28×28-derived.** PneumoniaMNIST is centre-cropped and resampled from
   full-resolution films, so findings that depend on fine detail or on the periphery are gone
   before the model sees anything. None of this transfers to full-resolution DICOM without
   re-validation.
3. **Pediatric, single-source, binary.** One collection, one age group, two classes. Real
   reporting is multi-label, multi-institution, and comes with priors and clinical context.
4. **Naturalistic corruption only.** The battery covers benign acquisition variation. It says
   nothing about adversarial robustness, which is a different and much more expensive question.
5. **Single-layer Mahalanobis.** Weaker than multi-layer or ensembled OOD detectors, and it
   inherits whatever biases live in `m0-resnet18`'s feature space. We chose it because it needs no
   OOD data at fit time and runs in one forward pass.
6. **The weights are a judgement call, and the shift study shows what it costs.** The
   0.20/0.40/0.25/0.15 split was fixed a priori. Averaging four signals dilutes the one that
   carries a distribution shift: the composite detects the adult arm at AUROC 0.7955 while the raw
   embedding percentile alone reaches 0.9592. A learned or regime-aware weighting would very
   likely beat this, and it's the clearest next thing to build.
7. **The adult arm's labels are noisy.** NLP-mined from free-text reports. The 62.6% accuracy
   figure is indicative, not a benchmark, and none of the claims that matter rest on it.
8. **One shift axis, one direction.** Pediatric → adult, one source hospital → one other. Says
   nothing about scanner vendor, view position, or the reverse direction.
9. **Three checkpoints is a small ensemble.** Disagreement is a noisy estimate from three votes.
   More members would sharpen it at linear cost.
10. **Thresholds come from 524 validation images.** The selected values carry real sampling
    variance, and the adult arm is 484 images. The bootstrap CIs in `shift_study.json` are the
    honest width of these estimates.
11. **No temporal or site-level validation.** No comparison against reader performance, no
    prospective evaluation. None of the standard evidence a clinical claim would require.

## Judge FAQ

**Why not just use confidence?**
Because confidence is a distance to a decision boundary, and a two-class softmax has no state in
which to say "this input is unlike my training data" — the two probabilities sum to 1 no matter
what you feed it. Measured: mean confidence is 86.0% on adult films and 95.8% on breast
ultrasound, *higher* on the modality it has no business seeing. Confidence is a good
in-distribution error ranker, the best of the five signals we tested (AURC 0.0126), and blind to
this failure mode.

**Then why not use only the embedding detector?**
It's the best shift detector we measured (AUROC 0.9592) and the *worst* in-distribution error
ranker (AURC 0.0385, against 0.0126 for confidence). A guardrail built only from embedding
distance would wave through the genuinely hard cases that come from the population it was trained
on. See *Confident but fragile* in the demo deck: typicality is perfectly fine, and the label
flips under a gamma change.

**Why combine signals if the composite is weaker on some metrics?**
It is weaker, and we say so on the audit page. Under margins fixed before the study ran, no signal
clears both regimes, ours included. The claim we'll defend is threshold-free: rescale each regime
so the best signal scores 1 and the worst 0, then take the lower of a signal's two scores. The
composite has the best worst case, 0.383 against 0.203 for confidence, and nothing beats it on
both axes at once. In practice you don't ship a scalar anyway. You ship four checks and two gates,
and the verdict tells you which one fired.

**Why ChestMNIST?**
Because it's the shift that actually happens. Same modality, same anatomy, same projection,
different hospital and a different patient population. Breast ultrasound is in the study too, as
the extreme fourth arm, but nobody deploys a chest X-ray model on ultrasound by accident.
Everybody deploys it on someone else's patients. ChestMNIST is also CC BY 4.0, fetchable through
the same `medmnist` API, and MD5-verified, so the arm reproduces with one command.

*And the obvious objection — "adults and children look different, of course an embedding detector
notices" — is the point rather than a flaw.* The difference is plainly visible in the image, it's
detectable at AUROC 0.9592, and the classifier's own confidence still doesn't detect it.

**What does `PASS` actually mean?**
"None of the four checks found a reason to withhold this prediction." That's all. It is not
evidence the prediction is correct. On the held-out test split the PASS band is 97.9% accurate, so
8 of 381 passed cases are still wrong, and the demo deck ships one of them on purpose
(*Confidently wrong — missed*). `PASS` is the absence of a detected problem, not the presence of a
guarantee.

**Does ScanProof establish clinical safety?**
No. It's a research prototype on public benchmark data. There's no clinical validation, no
prospective evaluation, no reader study, no regulatory clearance, and no claim to any of those.

**How were the thresholds selected?**
`python -m scanproof.evaluate` selects them on the 524-image pediatric validation split and writes
them to `artifacts/reliability_config.json`. The rule is the stricter of two constraints: the
lowest score whose PASS band reaches 99% selective accuracy, and the quantile capping PASS
coverage at 70%. The coverage cap does real work, because the ensemble nearly saturates validation
and an accuracy target alone would be met by passing everything. The result was PASS ≥ 97.09,
REVIEW ≥ 84.04, frozen before any test or shift arm was scored.

**What prevents test-set leakage?**
Three things, in order of importance. Thresholds and temperature scalars are fit on validation
only, and the 624-image test split is scored once, afterwards. `scanproof.shift` loads
`reliability_config.json` and re-tunes nothing, so the study can't move a threshold even if it
wanted to. And the Mahalanobis statistics are fit on **training** features only. The margins for
"acceptable in both regimes" were also fixed in `config.py` before the shift study ran — and when
the answer came back negative, we left them alone and published the negative result.

## Repository layout

```
scanproof/      Python package — inference, reliability, evaluation, API
frontend/       Vite + React + TypeScript + Tailwind v4
video/          Remotion demo video, narration-derived edit
tests/          pytest suite
artifacts/      generated JSON, committed (small, traceable)
demo_cases/     PNGs + manifest with cached results, committed
data/           datasets (git-ignored, reproducible via `make data`)
models/         weights + OOD stats (git-ignored, reproducible via `make train`)
```

Datasets, model weights, caches, build output and virtualenvs are all git-ignored. What's
committed is source, configuration, and the small generated artifacts that trace back to the
command that made them.

## License

Code: MIT. Data: CC BY 4.0 (MedMNIST), attributed above. Pretrained weights: BSD-3-Clause
(torchvision).
