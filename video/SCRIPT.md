# ScanProof — narration

**2:12.0 · 11 beats · voice `af_heart` (Kokoro-82M).**

## Register

Written to be spoken, not presented. Contractions, direct address, and connective tissue
between sentences. Every technical term is either replaced by the plain idea or stated as an
aside right after it — so a judge who has never heard "typicality" follows the question, and
one who has still hears the right word. On screen, the plain question leads and the technical
name sits beside it as a label.

The video opens on the consequence, not the product: the first six seconds say what goes wrong
in deployment, the proof lands at 0:07, and ScanProof is not named until 0:21.

---

## The lines

| # | Beat | In | Out |
|---|---|---|---|
| 01 | The problem | 0:00.0 | 0:10.3 |
| 02 | The proof | 0:10.3 | 0:18.8 |
| 03 | Why it can't warn you | 0:18.8 | 0:27.3 |
| 04 | The guardrail | 0:27.3 | 0:39.9 |
| 05 | One number isn't enough | 0:39.9 | 0:58.2 |
| 06 | The deployment test | 0:58.2 | 1:23.8 |
| 07 | No labels needed | 1:23.8 | 1:26.9 |
| 08 | The obvious objection | 1:26.9 | 1:38.0 |
| 09 | Why four checks | 1:38.0 | 1:58.0 |
| 10 | How it was built | 1:58.0 | 2:06.7 |
| 11 | Close | 2:06.7 | 2:12.0 |

---

### 01 · The problem — 0:00.0

> **0:00.0** This happens a lot. A hospital trains an A I on its own X-rays, someone runs it somewhere else, and it quietly gets worse. It never sounds any less sure.

### 02 · The proof — 0:10.3

> **0:10.3** Here's one. Ninety-nine point nine percent confident. It's an adult chest X-ray, and this model has only ever seen children.

### 03 · Why it can't warn you — 0:18.8

> **0:18.8** And it can't warn you. It has two answers, pneumonia or normal, and they always add up to one. There's no box for, I've never seen this.

### 04 · The guardrail — 0:27.3

> **0:27.3** So ScanProof asks its own four questions. Has it seen images like this before? Nudge the picture, does it change its mind? Do three separate models agree? And is this close to a coin flip?

### 05 · One number isn't enough — 0:39.9

> **0:39.9** Here's why one number isn't enough. The model calls this one normal, ninety percent confident.

> **0:45.7** I change the brightness curve. Nothing a radiologist would mention. It flips. Five of our twenty-one small tweaks changed its answer. The X-ray didn't change. Only its mind did.

### 06 · The deployment test — 0:58.2

> **0:58.2** But this is the failure that matters. Trained on children in Guangzhou. Run on adults at the N I H.

> **1:04.6** Watch the model. Ninety-three point six, down to eighty-six. Barely moves. On a breast ultrasound, not even a chest X-ray, it climbs back up.

> **1:13.7** Now watch ours. The, have I seen this before, check jumps to the ninety-eighth percentile. Our pass rate falls from sixty-two percent to under five.

### 07 · No labels needed — 1:23.8

> **1:23.8** And we never needed the right answer to see that.

### 08 · The obvious objection — 1:26.9

> **1:26.9** Maybe adult scans just look different? We ran our own children's films through identical processing. Everything moved about a point. It's the patients, not the pixels.

### 09 · Why four checks — 1:38.0

> **1:38.0** Here's the honest part. For ordinary mistakes, plain confidence beat our combined score. For spotting the wrong patient, it's nearly useless. Neither covers both, and we published that.

> **1:49.5** So we run four. Different problems trip different alarms. Here, one caught it. On that earlier film, a different one did.

### 10 · How it was built — 1:58.0

> **1:58.0** All of it came from two scripts, on data the model never saw. Thresholds locked before we touched the test set. It's all in the repo.

### 11 · Close — 2:06.7

> **2:06.7** ScanProof. Four checks, one decision, and the evidence behind it.

---

## Changing it

`narration/lines.json` holds the text. The cut derives from the audio, so editing a line
re-times its scene automatically.

```sh
python narration/synth.py                  # --voice am_michael, --speed 1.08
node narration/build.mjs --measure-only
npx remotion render src/index.ts ScanProofDemo out/scanproof-demo.mp4 --codec=h264
```

## Numbers spoken aloud

| Spoken | Value | Source |
|---|---|---|
| classifier confidence | 99.9% | `demo_cases/manifest.json` → `shift-adult-confident` |
| fragile case confidence | 90% | `confident-but-fragile` |
| changes that flipped it | 5 of 21 | same |
| confidence, pediatric → adult | 93.6% → 86.0% | `shift_study.json` arms |
| "have I seen this" percentile | → 98.4 | `shift_study.json` arms |
| pass rate | 62.0% → under 5% | `shift_study.json` arms |
| control shift | ~1 point | `resolution_control` |

`pytest tests/test_claims.py` fails if the repo documentation drifts from these.

**Research prototype — not for diagnosis.** Stated on the end card.
