# Editing the narration

Everything is in **`narration/script.json`**. Edit that one file, run two commands, done.
The video re-times itself around whatever you write — scenes stretch or shrink, charts redraw
on the new cue, number counters follow. You never adjust a frame count.

```sh
python narration/synth.py            # regenerate the voice
node narration/build.mjs --measure-only   # re-measure and re-time the edit
npx remotion render src/index.ts ScanProofDemo out/scanproof-demo.mp4 --codec=h264 --overwrite
```

## The fast loop

Don't re-render two minutes of video to check one sentence. Do this instead:

```sh
python narration/synth.py --only stake --play
```

Synthesises just that line and plays it. Tweak, run again, repeat until it sounds right. Render
once at the end.

```sh
python narration/synth.py --list     # every line id, current length, first words
```

## What you can change

### The words

```json
{ "id": "stake", "text": "This happens a lot. A hospital trains an A I on its own X-rays…" }
```

Write it how you'd say it. Two things the voice needs help with:

- **Initialisms** — write `N I H`, not `NIH`, or it tries to pronounce it as a word.
- **Numbers** — spell them out. `ninety-three point six`, not `93.6`. Digits get read
  inconsistently.

### Pauses inside a sentence

Put `[0.4]` anywhere in the text. That inserts exactly 0.4 seconds of silence at that point.

```json
"text": "This happens a lot. [0.5] A hospital trains an A I on its own X-rays…"
```

This is real spliced silence, not a punctuation hint the model might ignore — the text either
side is synthesised separately and the gap dropped in between. Use it to break up a sentence
that runs together, or to land a beat before a number.

Good places for one: before a figure you want to hit, after a rhetorical question, between two
clauses the voice is rushing.

### The gap after a line

```json
{ "id": "deployGuardrail", "text": "…", "pauseAfter": 1.1 }
```

Silence appended after the line. This is also what holds a scene open while a chart finishes
drawing — the deployment beat has a longer one for exactly that reason. Shorten it and the cut
comes sooner; the visuals compress to match.

### Speed, globally or per line

```json
{ "voice": "af_heart", "speed": 1.08 }
```

…and to slow one sentence without slowing the read:

```json
{ "id": "deployConfidence", "text": "…", "speed": 0.98 }
```

Number-heavy lines often want this.

### The voice

```json
{ "voice": "af_heart" }
```

Others that sound good: `am_michael`, `am_fenrir`, `af_bella`, `af_nicole`. British: `bf_emma`,
`bm_george`. Try one without editing the file:

```sh
python narration/synth.py --only close --voice am_michael --play
```

### Splitting or adding lines

A `scene` groups lines onto one visual. Add a line to a beat and that scene simply gets longer:

```json
{ "scene": "deployment", "lines": [
  { "id": "deploySetup",      "text": "…", "pauseAfter": 0.25 },
  { "id": "deployConfidence", "text": "…", "pauseAfter": 0.25 },
  { "id": "deployGuardrail",  "text": "…", "pauseAfter": 1.10 }
]}
```

Ids must stay unique. Two scenes reference their line ids from the animation code —
`fragile` uses `fragilePayoff` to start the sweep, and `deployment` uses `deployConfidence`
and `deployGuardrail` to time the two traces. Rename those and the visual cue moves with them
only if you also update `src/scenes/Fragile.tsx` / `Deployment.tsx`. Everything else is free.

## Using your own voice instead

Record each line as `public/vo/<id>.wav`, then skip the synth step:

```sh
node narration/build.mjs --measure-only
```

Same re-timing behaviour. `python narration/synth.py --list` gives you the id list and the
lengths to aim for.

## Numbers you shouldn't change freely

These are read from the committed artifacts and `pytest tests/test_claims.py` fails if the
documentation drifts from them:

| Spoken | Value |
|---|---|
| classifier confidence | 99.9% |
| fragile case confidence | 90% |
| changes that flipped it | 5 of 21 |
| confidence, pediatric → adult | 93.6% → 86.0% |
| "have I seen this" percentile | → 98.4 |
| pass rate | 62.0% → under 5% |

Rephrase around them freely. If you want a *different* number, it has to be re-derived from the
study rather than just said.
