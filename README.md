# ScanProof

A guardrail for chest X-ray classifiers. It runs four checks on every prediction and returns
`PASS`, `REVIEW` or `BLOCK` along with the measurement that drove the verdict.

> **Research prototype, not for diagnosis.** No clinical validation, no regulatory claim, not a
> medical device. `PASS` means no check found a reason to withhold the prediction. It is not
> evidence that the prediction is correct.

## The problem

A two-class softmax splits its probability between the two classes it knows. Feed it something it
has never seen and it does not get quieter, it just picks a side. Nothing in the output can mean
"I don't recognise this".

My model, fine-tuned on pediatric chest films from one hospital, reports 86.0% mean confidence on
adult films from another. On breast ultrasound it reports 95.8%, higher than on the X-rays it was
actually trained for.

So ScanProof does not try to build a better confidence score. It runs four checks that fail for
different reasons:

| Check | Asks | Fails when |
| --- | --- | --- |
| Typicality | Has the model seen inputs like this? | the embedding sits far from the training manifold |
| Stability | Does the answer survive harmless edits? | the label flips under a label-preserving perturbation |
| Agreement | Do independently trained models concur? | three checkpoints disagree |
| Confidence | How far from the decision boundary? | the margin is thin |

There is a weighted 0-100 score for ranking, but what you act on is which check failed.

## Results

Every figure below comes from `make audit` and `make shift` and is committed under `artifacts/`.
`pytest tests/test_claims.py` parses them back out of this file and fails if they drift.

### The deployment test

Train on children, run on adults. This is the ordinary way a deployed imaging model breaks: not a
weird input, just somebody else's patients. Fine-tuned on pediatric films (ages 1-5, Guangzhou
Women and Children's Medical Center), then run on adult frontal films from the NIH Clinical Center.

| Measure | Pediatric (n=624) | Adult (n=484) |
| --- | --- | --- |
| Model confidence | 93.6% | 86.0% |
| Embedding percentile | 50.1 | 98.4 |
| PASS rate | 62.0% | 4.8% |

Confidence drops 7.6 points, nowhere near enough to notice in production. Typicality goes from the
middle of the training distribution to its 98th percentile, and the guardrail withholds 95% of
these inputs.

All three numbers are label-free. They are properties of the input and the model, so you can
compute them on a live stream before anyone knows the right answer.

Sub-scores, pediatric to adult: typicality 0.878 to 0.116, agreement 0.801 to 0.619, confidence
0.892 to 0.759, stability 0.853 to 0.747. The embedding check carried this almost single-handed.
The other three stay because they catch cases this arm does not contain, such as the
*Confident but fragile* case in the demo deck, where typicality is fine and the label still flips.

### The confound is controlled

The adult set is only available at 128 px unless you download 3.7 GB, so it gets resampled to 224.
A control arm puts the pediatric films through that identical path. PASS rate moves 0.96 points,
accuracy 1.1 points. Resolution is not what the study is measuring.

### The negative result

On in-distribution data, plain confidence is a better error ranker than my composite score: AURC
0.0126 against 0.0175. Lower AURC is better, higher AUROC is better.

| Signal | In-distribution AURC | Shift AUROC | Worst case |
| --- | --- | --- | --- |
| Model confidence | 0.0126 | 0.7479 | 0.203 |
| Perturbation instability | 0.0161 | 0.6941 | 0.000 |
| ScanProof composite | 0.0175 | 0.7955 | 0.383 |
| Ensemble disagreement | 0.0188 | 0.7113 | 0.065 |
| Embedding percentile | 0.0385 | 0.9592 | 0.000 |

I fixed the margins for "acceptable in both regimes" before running the study: within 0.01 AURC and
0.05 AUROC of the best signal in each. As measured, no signal clears both, mine included. I did not
loosen them afterwards, and the failure is printed on the audit page rather than buried here.

What the evidence does support is narrower. Rescale each regime so the best signal scores 1 and the
worst 0, then take the lower of a signal's two scores. That is the question a deployed system
faces, since it commits to one number without knowing which failure shows up next. On that
criterion the composite leads at 0.383 against 0.203, and nothing beats it on both axes.

That is worst-case coverage, not dominance. ScanProof does not beat confidence in-distribution. It
covers a failure mode confidence cannot see.

### In-distribution behaviour

On the 624-image held-out pediatric test split: accuracy 94.2%, AUROC 0.992, ECE 0.045 falling to
0.041 after temperature scaling. The PASS band reaches 97.9% accuracy at 61.1% coverage,
and 28 of the 36 test errors land outside it.

## Quick start

```sh
make setup       # .venv (Python 3.12) + python deps + npm install
make data        # PneumoniaMNIST + OOD probes (~250 MB, once)
make shift-data  # adult ChestMNIST arm (~1.4 GB, once)
make train       # fine-tune 3 members, calibrate, fit OOD stats (~15 min on Apple Silicon)
make audit       # select thresholds on val, evaluate on test
make shift       # the domain-shift study (~3 min)
make demo        # build the demo case deck
make build       # frontend
make serve       # http://127.0.0.1:8000
```

`make reproduce` runs all of it in order. Expect about 20 minutes from a clean checkout.

Before demoing, run `make preflight`. It re-analyses every shipped case live, diffs against the
committed cache, and refuses placeholder artifacts. `DEMO.md` is the five-minute walkthrough.

For frontend work, `make dev` runs the API on `:8000` and Vite on `:5173` with a proxy. You need
Python 3.10-3.13, Node 18+, and [`uv`](https://docs.astral.sh/uv/). MPS and CUDA are used when
present; CPU works and is slower.

The demo path makes no network calls. Fonts are vendored, the frontend is served by the same
FastAPI process as the API, and every model and dataset asset is local once `make data` and
`make train` have run.

## How the score is built

Four sub-scores in `[0,1]`, combined with fixed weights from `config.WEIGHTS`:

| Sub-score | Weight | Measures | Zero when |
| --- | --- | --- | --- |
| `stability` | 0.40 | survival of the perturbation battery | 25% of variants flip, or mean absolute delta-p at least 0.25 |
| `agreement` | 0.25 | spread across three checkpoints | sigma of P(pneumonia) at least 0.25; capped at 0.35 on a split vote |
| `confidence` | 0.20 | calibrated margin of the predicted class | confidence at or below 0.50; saturates at 0.95 |
| `typicality` | 0.15 | embedding distance from the training manifold | at the 100th percentile; decay starts at the 90th |

The weighted score is banded, then three gates can override it:

- **OOD gate.** Embedding percentile at or above 99.5 forces `BLOCK`. The model has no comparable
  training examples, so its output is not interpretable at any confidence.
- **Fragility gate.** A class flip at the mildest severity caps the verdict at `REVIEW`.
- **Split-vote backstop.** A checkpoint disagreement can never reach `PASS`.

The gates override the weighted score deliberately. A failure this specific should not get averaged
away by good numbers elsewhere.

### The perturbation battery

Seven families at three severities each, 21 variants, all deterministic and all label-preserving.

| Family | Severities | Stands in for |
| --- | --- | --- |
| Brightness | +12% / +24% / +36% | exposure shift |
| Contrast | -15% / -28% / -40% | windowing |
| Gamma | 1.25 / 1.55 / 1.90 | display transfer curve |
| Detector noise | sigma 0.02 / 0.045 / 0.08 | sensor noise |
| Blur | sigma 0.8 / 1.6 / 2.6 px | focus or motion softness |
| Rotation | 3 / 6 / 10 degrees | patient or detector rotation |
| Resolution loss | 0.70x / 0.50x / 0.35x | lossy storage, lower-resolution acquisition |

Rotation is reflect-padded, because black corners would be an out-of-distribution cue in their own
right and would confound stability with typicality.

### Thresholds

`python -m scanproof.evaluate` selects them on the validation split and writes
`artifacts/reliability_config.json`. The test split is never used to choose anything.

- `review_threshold`: the score quantile putting 12% of validation in `BLOCK`.
- `pass_threshold`: the stricter of the lowest score whose `PASS` band reaches 99% selective
  accuracy, and the quantile capping `PASS` coverage at 70%.

The coverage cap matters. The ensemble nearly saturates validation, so an accuracy target alone is
satisfied by passing everything, at which point the verdict stops discriminating. Selected values
were PASS at or above 97.09 and REVIEW at or above 84.04, frozen before any test or shift arm ran.

## The shift study

`make shift` runs four arms, ordered by distance from the training distribution:

| Arm | Data | n | Accuracy | Confidence | PASS rate |
| --- | --- | --- | --- | --- | --- |
| `in_distribution` | PneumoniaMNIST test, native 224 | 624 | 94.2% | 94.5% | 61.1% |
| `resolution_control` | the same films, resampled | 624 | 93.1% | 93.6% | 62.0% |
| `domain_shift` | ChestMNIST, adult, balanced | 484 | 62.6% | 86.0% | 4.8% |
| `wrong_modality` | BreastMNIST | 156 | n/a | 95.8% | 0.6% |

Accuracy falls 30.5 points. Confidence falls 7.6. On breast ultrasound confidence does not just
fail to drop, it rises to 95.8%, higher than on the adult films that were at least the right
modality.

Nothing in the study re-tunes a threshold. `scanproof.shift` loads `reliability_config.json` and
changes nothing in it.

Two caveats belong next to this. The composite is a worse shift detector than the raw embedding
percentile, 0.7955 against 0.9592, because averaging four signals dilutes the one carrying the
shift. And ChestX-ray14 labels are NLP-mined from free-text reports, so the 62.6% accuracy figure
is indicative rather than a clean benchmark. Neither touches the headline, which is about the
model's own confidence and needs no labels.

## Layout

```
scanproof/      Python package: inference, reliability, evaluation, API
frontend/       Vite + React + TypeScript + Tailwind v4
video/          Remotion demo video
tests/          pytest suite
artifacts/      generated JSON, committed
demo_cases/     PNGs + manifest with cached results, committed
```

`reliability.py` imports no torch and touches no disk, so the gate and arithmetic tests run in
milliseconds against plain arrays. `config.py` holds the ensemble composition, weights and
thresholds, which is the one place to audit the formula.

Run `make test` for the suite: perturbation determinism, severity monotonicity, structure
preservation, sub-score arithmetic, every gate, and API behaviour in live and degraded mode.

## Data and model sources

| Asset | Source | License |
| --- | --- | --- |
| PneumoniaMNIST, 5,856 pediatric chest X-rays | [medmnist.com](https://medmnist.com/), [Zenodo 10519652](https://zenodo.org/records/10519652) | CC BY 4.0 |
| ChestMNIST, NIH ChestX-ray14 adult films | same | CC BY 4.0 |
| BreastMNIST, 780 breast ultrasound images | same | CC BY 4.0 |
| ResNet-18 and DenseNet-121 ImageNet weights | torchvision `IMAGENET1K_V1` | BSD-3-Clause |

Datasets are fetched through the official `medmnist` package, which verifies MD5s against the
Zenodo record. Nothing is scraped. MedMNIST images are de-identified and published by the dataset
authors. No private or identifiable medical data is used anywhere in this repository.

PneumoniaMNIST derives from Kermany et al., *Cell* 176(2), 2018. ChestMNIST derives from Wang et
al., *CVPR* 2017. Both via Yang et al., "MedMNIST v2", *Scientific Data* 10, 41 (2023). Temperature
scaling follows Guo et al. (ICML 2017) and Mahalanobis OOD detection follows Lee et al. (NeurIPS
2018), both re-implemented from the published descriptions.

One thing worth knowing about the splits: MedMNIST builds PneumoniaMNIST's train and val splits
from the source training collection and uses the source validation collection as test. So test is
genuinely shifted, and the ensemble scores about 98% on validation but materially lower on test.
That is what makes it a useful reliability benchmark, since there are real errors left to catch.

## Limitations

1. `PASS` is not a correctness guarantee. The PASS band is 97.9% accurate, so 8 of 381 passed cases
   are still wrong. The demo deck ships one on purpose.
2. The data is 28x28-derived. PneumoniaMNIST is centre-cropped and resampled from full-resolution
   films, so fine detail and the periphery are gone before the model sees anything. None of this
   transfers to full-resolution DICOM without re-validation.
3. Pediatric, single-source, binary. Real reporting is multi-label and multi-institution.
4. Naturalistic corruption only. The battery says nothing about adversarial robustness.
5. Single-layer Mahalanobis, weaker than multi-layer or ensembled OOD detectors. It needs no OOD
   data at fit time and runs in one forward pass, which is why I chose it.
6. The weights are a judgement call. The 0.20/0.40/0.25/0.15 split was fixed a priori, and the
   shift study shows what it costs. A learned or regime-aware weighting would likely beat it, and
   it is the clearest next thing to build.
7. The adult arm's labels are noisy, NLP-mined from free-text reports. No claim that matters rests
   on them.
8. One shift axis, one direction. Pediatric to adult, one hospital to one other. Says nothing about
   scanner vendor, view position, or the reverse direction.
9. Three checkpoints is a small ensemble, so disagreement is a noisy estimate from three votes.
10. Thresholds come from 524 validation images and the adult arm is 484, so both carry real
    sampling variance. Bootstrap CIs are in `shift_study.json`.
11. No temporal or site-level validation, no reader comparison, no prospective evaluation.

## License

Code: MIT. Data: CC BY 4.0 (MedMNIST), attributed above. Pretrained weights: BSD-3-Clause
(torchvision).
