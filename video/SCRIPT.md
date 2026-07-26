# ScanProof — narration

**2:02.6 · 11 beats · `af_heart` (Kokoro-82M) at 1.08×.**

> **To change any of this, edit `narration/script.json`** — words, pauses, speed, voice.
> See [narration/README.md](narration/README.md). The edit re-times itself; you never touch a
> frame count.

## Register

Written to be spoken, not presented. Contractions, direct address, sentences that join up.
Every technical term is either replaced by the plain idea or stated as an aside right after it,
so a judge who has never heard "typicality" follows the question and one who has still hears
the right word. On screen the plain question leads and the technical name sits beside it.

The video opens on the consequence, not the product: the first six seconds say what goes wrong
in deployment, the proof lands next, and ScanProof is not named until past twenty seconds.

---

## The lines

| # | Beat | In | Out |
|---|---|---|---|
| 01 | The problem | 0:00.0 | 0:09.6 |
| 02 | The proof | 0:09.6 | 0:17.5 |
| 03 | Why it can't warn you | 0:17.5 | 0:25.5 |
| 04 | The guardrail | 0:25.5 | 0:36.9 |
| 05 | One number isn't enough | 0:36.9 | 0:54.2 |
| 06 | The deployment test | 0:54.2 | 1:18.1 |
| 07 | No labels needed | 1:18.1 | 1:20.8 |
| 08 | The obvious objection | 1:20.8 | 1:31.0 |
| 09 | Why four checks | 1:31.0 | 1:49.7 |
| 10 | How it was built | 1:49.7 | 1:57.7 |
| 11 | Close | 1:57.7 | 2:02.6 |

---

### 01 · The problem — 0:00.0

> **0:00.0** This happens a lot. A hospital trains an A I on its own X-rays, someone runs it somewhere else, and it quietly gets worse. It never sounds any less sure.

### 02 · The proof — 0:09.6

> **0:09.6** Here's one. Ninety-nine point nine percent confident. It's an adult chest X-ray, and this model has only ever seen children.

### 03 · Why it can't warn you — 0:17.5

> **0:17.5** And it can't warn you. It has two answers, pneumonia or normal, and they always add up to one. There's no box for, I've never seen this.

### 04 · The guardrail — 0:25.5

> **0:25.5** So ScanProof asks its own four questions. Has it seen images like this before? Nudge the picture, does it change its mind? Do three separate models agree? And is this close to a coin flip?

### 05 · One number isn't enough — 0:36.9

> **0:36.9** Here's why one number isn't enough. The model calls this one normal, ninety percent confident.

> **0:42.4** I change the brightness curve. Nothing a radiologist would mention. It flips. Five of our twenty-one small tweaks changed its answer. The X-ray didn't change. Only its mind did.

### 06 · The deployment test — 0:54.2

> **0:54.2** But this is the failure that matters. Trained on children in China. Run on adults at the N I H.

> **1:00.0** Watch the model. Ninety-three point six, down to eighty-six. Barely moves. On a breast ultrasound, not even a chest X-ray, it climbs back up.

> **1:08.7** Now watch ours. The, have I seen this before, check jumps to the ninety-eighth percentile. Our pass rate falls from sixty-two percent to under five.

### 07 · No labels needed — 1:18.1

> **1:18.1** And we never needed the right answer to see that.

### 08 · The obvious objection — 1:20.8

> **1:20.8** Maybe adult scans just look different? We ran our own children's films through identical processing. Everything moved about a point. It's the patients, not the pixels.

### 09 · Why four checks — 1:31.0

> **1:31.0** Here's the honest part. For ordinary mistakes, plain confidence beat our combined score. For spotting the wrong patient, it's nearly useless. Neither covers both, and we published that.

> **1:42.0** So we run four. Different problems trip different alarms. Here, one caught it. On that earlier film, a different one did.

### 10 · How it was built — 1:49.7

> **1:49.7** All of it came from two scripts, on data the model never saw. Thresholds locked before we touched the test set. It's all in the repo.

### 11 · Close — 1:57.7

> **1:57.7** ScanProof. Four checks, one decision, and the evidence behind it.

---

**Research prototype — not for diagnosis.** Stated on the end card.
