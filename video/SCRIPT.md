# ScanProof — narration

**2:06.0 · 11 beats · 15 lines · voice `af_heart` (Kokoro-82M).**

The audio is already in the render. These are the lines it speaks.

## Why this voice

Kokoro-82M is a StyleTTS2 model, Apache-2.0, ~350 MB, running locally. It was chosen over a
hosted API for one practical reason: **no account and no API key**, so the video reproduces
from a clean checkout with one command. Every clip is silence-trimmed and loudness-normalised
to −16 LUFS in `narration/synth.py`.

If you want the absolute quality ceiling, ElevenLabs is a step up and its free tier (~10 min
of audio a month) covers this script several times over — but it needs an account and a key,
and the licence on the free tier is non-commercial. The pipeline below takes any audio source.

## Changing the voice, the pace, or the reader

The cut is derived from the narration, not fixed alongside it: `narration/synth.py` writes the
audio, `narration/build.mjs` measures it, and `src/timeline.ts` lays out the scenes from those
measurements. Scene lengths, chart draws and number counters all re-time themselves.

```sh
# different Kokoro voice  (am_michael, am_fenrir, af_bella, bf_emma, bm_george …)
python narration/synth.py --voice am_michael
node narration/build.mjs --measure-only

# brisker read
python narration/synth.py --speed 1.08
node narration/build.mjs --measure-only

# your own voice, or any other TTS: drop <id>.wav into public/vo/, then
node narration/build.mjs --measure-only

npx remotion render src/index.ts ScanProofDemo out/scanproof-demo.mp4 --codec=h264
```

Line text lives in `narration/lines.json`, shared by the synthesiser and the measurer so the
two cannot drift.

---

## The lines

| # | Beat | In | Out |
|---|---|---|---|
| 01 | Hook | 0:00.0 | 0:05.1 |
| 02 | Why confidence cannot help | 0:05.1 | 0:12.8 |
| 03 | Title | 0:12.8 | 0:16.9 |
| 04 | The four checks | 0:16.9 | 0:27.9 |
| 05 | Confidence is not reliability | 0:27.9 | 0:45.1 |
| 06 | The deployment test | 0:45.1 | 1:12.4 |
| 07 | Label-free | 1:12.4 | 1:16.6 |
| 08 | Confound control | 1:16.6 | 1:29.1 |
| 09 | Why four checks | 1:29.1 | 1:48.5 |
| 10 | How it was built | 1:48.5 | 1:60.0 |
| 11 | Close | 1:60.0 | 2:06.0 |

---

### 01 · Hook — 0:00.0

> **0:00.0** Ninety-nine point nine percent confident. On a patient it has never seen.

### 02 · Why confidence cannot help — 0:05.1

> **0:05.1** A softmax has two outputs. Pneumonia. Normal. There is no third option that says, I don't recognise this input.

### 03 · Title — 0:12.8

> **0:12.8** ScanProof. A deployment guardrail for medical imaging models.

### 04 · The four checks — 0:16.9

> **0:16.9** Four independent checks on every prediction. Typicality. Stability. Agreement. Confidence. Pass, review, or block, with the measurement behind it.

### 05 · Confidence is not reliability — 0:27.9

> **0:27.9** Here is why one number is not enough. This film is normal, at ninety percent confidence.

> **0:33.7** Change the gamma. A windowing difference no radiologist would report differently. The model changes its answer. Five of twenty-one perturbations flip the label.

### 06 · The deployment test — 0:45.1

> **0:45.1** Now the failure that ends deployments. Trained on pediatric films in Guangzhou. Run on adults at the N I H.

> **0:52.3** Watch the model first. Ninety-three point six, down to eighty-six. It barely moves. On breast ultrasound, not even a chest X-ray, it climbs back up.

> **1:01.9** Now watch the guardrail. Typicality goes from the fiftieth percentile to the ninety-eighth. The pass rate falls from sixty-two percent to four point eight.

### 07 · Label-free — 1:12.4

> **1:12.4** Neither number needs a label. Both are properties of the input.

### 08 · Confound control — 1:16.6

> **1:16.6** Is it just resolution? A control arm puts the pediatric films through the adult set's exact resampling path. One point. One point. It is the population, not the pixels.

### 09 · Why four checks — 1:29.1

> **1:29.1** Confidence is the best in-distribution error ranker. Embedding distance is the best shift detector. Neither is good at both, and we publish the regime where our own composite loses.

> **1:40.4** Different failures trip different wires. Here, typicality caught it alone. On the fragile film, stability did.

### 10 · How it was built — 1:48.5

> **1:48.5** Thresholds frozen before the test split was scored. Public benchmark data throughout. Ninety tests, and thirty-two preflight checks that re-run every case and diff the result.

### 11 · Close — 1:60.0

> **1:60.0** ScanProof. Four checks. One decision. And the evidence behind it.

---

## Numbers spoken aloud

| Spoken | Value | Source |
|---|---|---|
| classifier confidence | 99.9% | `demo_cases/manifest.json` → `shift-adult-confident` |
| fragile case confidence | 90% | `confident-but-fragile` |
| perturbation flips | 5 of 21 | same |
| pediatric → adult confidence | 93.6% → 86.0% | `shift_study.json` arms |
| ultrasound confidence | 95.8% | `wrong_modality` arm |
| embedding percentile | 50.1 → 98.4 | `shift_study.json` arms |
| pass rate | 62.0% → 4.8% | `shift_study.json` arms |
| control deltas | ~1 point each | `resolution_control` |
| tests / preflight | 90 / 32 | `pytest`, `scanproof.preflight` |

`pytest tests/test_claims.py` fails if the repo documentation drifts from these.

**Research prototype — not for diagnosis.** Stated on the end card.
