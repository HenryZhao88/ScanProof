# ScanProof — narration

**1:56 · 11 beats · 15 recorded lines.**

The audio is already in the render. These are the lines it speaks, so you can re-record in
your own voice if you prefer — the edit will follow automatically.

## Re-recording

The cut is derived from the narration, not fixed alongside it. `narration/build.mjs` measures
each line and writes `src/vo.json`; the composition lays scenes out from those durations. So:

```sh
# option A — regenerate with a different system voice
node narration/build.mjs --voice Daniel     # en_GB; Samantha (en_US) is the default
node narration/build.mjs --rate 205         # faster read

# option B — use your own voice
#   record each line below as public/vo/<id>.wav, then:
node narration/build.mjs --measure-only
npx remotion render src/index.ts ScanProofDemo out/scanproof-demo.mp4 --codec=h264
```

Scene lengths, chart draws and number counters all re-time themselves. Nothing else to touch.

**Delivery:** brisk and flat. Roughly 190 wpm. The numbers are the persuasion — land them and
move on. Do not add warmth; this reads as an engineering result.

---

## The lines

| # | Beat | In | Out |
|---|---|---|---|
| 01 | Hook | 0:00.0 | 0:04.8 |
| 02 | Why confidence cannot help | 0:04.8 | 0:12.2 |
| 03 | Title | 0:12.2 | 0:16.4 |
| 04 | The four checks | 0:16.4 | 0:26.8 |
| 05 | Confidence is not reliability | 0:26.8 | 0:42.1 |
| 06 | The deployment test | 0:42.1 | 1:07.7 |
| 07 | Label-free | 1:07.7 | 1:11.5 |
| 08 | Confound control | 1:11.5 | 1:22.6 |
| 09 | Why four checks | 1:22.6 | 1:40.1 |
| 10 | How it was built | 1:40.1 | 1:50.3 |
| 11 | Close | 1:50.3 | 1:56.4 |

---

### 01 · Hook — 0:00.0

> **0:00.0** Ninety-nine point nine percent confident. On a patient it has never seen.

### 02 · Why confidence cannot help — 0:04.8

> **0:04.8** A softmax has two outputs. Pneumonia. Normal. There is no third option that says, I don't recognise this input.

### 03 · Title — 0:12.2

> **0:12.2** ScanProof. A deployment guardrail for medical imaging models.

### 04 · The four checks — 0:16.4

> **0:16.4** Four independent checks on every prediction. Typicality. Stability. Agreement. Confidence. Pass, review, or block, with the measurement behind it.

### 05 · Confidence is not reliability — 0:26.8

> **0:26.8** Here is why one number is not enough. This film is normal, at ninety percent confidence.

> **0:32.0** Change the gamma. A windowing difference no radiologist would report differently. The model changes its answer. Five of twenty-one perturbations flip the label.

### 06 · The deployment test — 0:42.1

> **0:42.1** Now the failure that ends deployments. Trained on pediatric films in Guangzhou. Run on adults at the N I H.

> **0:48.4** Watch the model first. Ninety-three point six, down to eighty-six. It barely moves. On breast ultrasound, not even a chest X-ray, it climbs back up.

> **0:58.0** Now watch the guardrail. Typicality goes from the fiftieth percentile to the ninety-eighth. The pass rate falls from sixty-two percent to four point eight.

### 07 · Label-free — 1:07.7

> **1:07.7** Neither number needs a label. Both are properties of the input.

### 08 · Confound control — 1:11.5

> **1:11.5** Is it just resolution? A control arm puts the pediatric films through the adult set's exact resampling path. One point. One point. It is the population, not the pixels.

### 09 · Why four checks — 1:22.6

> **1:22.6** Confidence is the best in-distribution error ranker. Embedding distance is the best shift detector. Neither is good at both, and we publish the regime where our own composite loses.

> **1:32.2** Different failures trip different wires. Here, typicality caught it alone. On the fragile film, stability did.

### 10 · How it was built — 1:40.1

> **1:40.1** Thresholds frozen before the test split was scored. Public benchmark data throughout. Ninety tests, and thirty-two preflight checks that re-run every case and diff the result.

### 11 · Close — 1:50.3

> **1:50.3** ScanProof. Four checks. One decision. And the evidence behind it.

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
