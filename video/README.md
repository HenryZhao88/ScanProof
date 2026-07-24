# ScanProof — demo video

1:51.5 at 1920×1080 with narration, built with Remotion. Every figure on screen is read from
`src/data.json`, which is exported from the repo's committed artifacts — the
video cannot drift from the audit.

```sh
cd video && npm i
npx remotion studio            # preview and scrub
npx remotion render src/index.ts ScanProofDemo out/scanproof-demo.mp4 --codec=h264
```

The voiceover is synthesised locally by Kokoro-82M (`narration/synth.py`) and measured by
`narration/build.mjs`, which writes `src/vo.json` — the edit is derived from those durations, so re-recording a line re-times its
scene automatically. `SCRIPT.md` has the lines and the swap instructions.

```sh
python narration/synth.py --voice af_heart   # regenerate audio
node narration/build.mjs --measure-only      # re-measure and re-time the edit
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
| `narration/lines.json` | The script, shared by synthesiser and measurer |
| `narration/synth.py` | Kokoro-82M voiceover, trimmed and loudness-normalised |
| `narration/build.mjs` | Measures the audio, writes `src/vo.json` |
| `src/parts.tsx` | Sheet, stamp, counter, plate — the reusable pieces |
| `src/scenes/` | One file per act |
| `src/data.json` | Real figures exported from `artifacts/` |

**Research prototype — not for diagnosis, not a medical device, no clinical validation.**
