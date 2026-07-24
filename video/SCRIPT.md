# ScanProof — narration

**1:51.5 · 11 beats · 15 lines · voice `af_heart` (Kokoro-82M).**

The audio is in the render. These are the lines it speaks.

## Structure

The video opens on the **consequence**, not the product. The first six seconds state what goes
wrong in deployment; the proof arrives at 0:06; the mechanism at 0:13; the product is not named
until 0:19, once there is a reason to care. An earlier cut opened on a number and then explained
a softmax, and lost the viewer before the stakes landed.

## Why this voice

Kokoro-82M — StyleTTS2, Apache-2.0, ~350 MB, running locally. Chosen over a hosted API because
it needs **no account and no key**, so the video reproduces from a clean checkout. Clips are
silence-trimmed and loudness-normalised to −16 LUFS in `narration/synth.py`.

ElevenLabs is the quality ceiling and its free tier covers this script several times over, but
it needs a key and its free licence is non-commercial. The pipeline takes any audio source.

## Changing the voice, pace, or reader

The cut derives from the narration: `synth.py` writes the audio, `build.mjs` measures it,
`src/timeline.ts` lays out scenes from those measurements. Scene lengths, chart draws and
counters all re-time themselves.

```sh
python narration/synth.py --voice am_michael     # am_fenrir, af_bella, bf_emma, bm_george …
python narration/synth.py --speed 1.08           # brisker
# or record your own as public/vo/<id>.wav
node narration/build.mjs --measure-only
npx remotion render src/index.ts ScanProofDemo out/scanproof-demo.mp4 --codec=h264
```

Line text lives in `narration/lines.json`, shared by synthesiser and measurer.

---

## The lines

| # | Beat | In | Out |
|---|---|---|---|
| 01 | The problem | 0:00.0 | 0:06.7 |
| 02 | The proof | 0:06.7 | 0:13.5 |
| 03 | Why it can't warn you | 0:13.5 | 0:19.8 |
| 04 | The guardrail | 0:19.8 | 0:29.3 |
| 05 | Confidence is not reliability | 0:29.3 | 0:44.8 |
| 06 | The deployment test | 0:44.8 | 1:06.5 |
| 07 | Label-free | 1:06.5 | 1:08.8 |
| 08 | Confound control | 1:08.8 | 1:19.9 |
| 09 | Why four checks | 1:19.9 | 1:37.6 |
| 10 | How it was built | 1:37.6 | 1:45.7 |
| 11 | Close | 1:45.7 | 1:51.5 |

---

### 01 · The problem — 0:00.0

> **0:00.0** A chest X-ray model trained at one hospital, deployed at another. Accuracy drops. Confidence doesn't.

### 02 · The proof — 0:06.7

> **0:06.7** Ninety-nine point nine percent confident. On an adult film, from a model trained only on children.

### 03 · Why it can't warn you — 0:13.5

> **0:13.5** It can't warn you. A softmax has two outputs. There's no third that says, I don't recognise this.

### 04 · The guardrail — 0:19.8

> **0:19.8** ScanProof runs four checks on every prediction. Typicality. Stability. Agreement. Confidence. Then pass, review, or block.

### 05 · Confidence is not reliability — 0:29.3

> **0:29.3** Here's why one number isn't enough. This film is normal, at ninety percent confidence.

> **0:34.9** Change the gamma. A windowing difference no radiologist would report. The model flips. Five of twenty-one perturbations change the label.

### 06 · The deployment test — 0:44.8

> **0:44.8** Now the real failure. Trained on children in Guangzhou. Run on adults at the N I H.

> **0:50.3** Confidence goes from ninety-three point six to eighty-six. It barely moves. On breast ultrasound it climbs back up.

> **0:57.6** Typicality goes from the fiftieth percentile to the ninety-eighth. The pass rate falls from sixty-two percent to four point eight.

### 07 · Label-free — 1:06.5

> **1:06.5** Neither number needs a label.

### 08 · Confound control — 1:08.8

> **1:08.8** Just resolution? A control arm runs the pediatric films through the adult set's exact resampling path. One point. It's the population, not the pixels.

### 09 · Why four checks — 1:19.9

> **1:19.9** Confidence is the best in-distribution error ranker. Embedding distance is the best shift detector. Neither is good at both, and we publish where ours loses.

> **1:29.8** Different failures trip different wires. Here, typicality caught it alone. On the fragile film, stability did.

### 10 · How it was built — 1:37.6

> **1:37.6** Thresholds frozen before the test split was scored. Public benchmark data. Ninety tests, thirty-two preflight checks.

### 11 · Close — 1:45.7

> **1:45.7** ScanProof. Four checks. One decision. And the evidence behind it.

---

## Numbers spoken aloud

| Spoken | Value | Source |
|---|---|---|
| classifier confidence | 99.9% | `demo_cases/manifest.json` → `shift-adult-confident` |
| fragile case confidence | 90% | `confident-but-fragile` |
| perturbation flips | 5 of 21 | same |
| pediatric → adult confidence | 93.6% → 86.0% | `shift_study.json` arms |
| embedding percentile | 50.1 → 98.4 | `shift_study.json` arms |
| pass rate | 62.0% → 4.8% | `shift_study.json` arms |
| control delta | ~1 point | `resolution_control` |
| tests / preflight | 90 / 32 | `pytest`, `scanproof.preflight` |

`pytest tests/test_claims.py` fails if the repo documentation drifts from these.

**Research prototype — not for diagnosis.** Stated on the end card.
