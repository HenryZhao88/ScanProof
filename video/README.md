# ScanProof — demo video

1:56 at 1920×1080 with narration, built with Remotion. Every figure on screen is read from
`src/data.json`, which is exported from the repo's committed artifacts — the
video cannot drift from the audit.

```sh
cd video && npm i
npx remotion studio            # preview and scrub
npx remotion render src/index.ts ScanProofDemo out/scanproof-demo.mp4 --codec=h264
```

The voiceover is synthesised by `narration/build.mjs`, which measures each line and writes
`src/vo.json` — the edit is derived from those durations, so re-recording a line re-times its
scene automatically. `SCRIPT.md` has the lines and the swap instructions.

```sh
node narration/build.mjs                 # regenerate audio + timings
node narration/build.mjs --measure-only   # after dropping in your own .wav files
```

## Regenerating the data

```sh
# from the repo root, after `make audit && make shift && make demo`
.venv/bin/python -c "..."   # see the export block in the project history
```

## Structure

| File | Role |
|---|---|
| `src/theme.ts` | Design tokens shared with the product |
| `src/timeline.ts` | Scene boundaries, derived from the measured narration |
| `narration/build.mjs` | Synthesises the voiceover and writes `src/vo.json` |
| `src/parts.tsx` | Sheet, stamp, counter, plate — the reusable pieces |
| `src/scenes/` | One file per act |
| `src/data.json` | Real figures exported from `artifacts/` |

**Research prototype — not for diagnosis, not a medical device, no clinical validation.**
