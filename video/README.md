# ScanProof — demo video

4:30 at 1920×1080, built with Remotion. Every figure on screen is read from
`src/data.json`, which is exported from the repo's committed artifacts — the
video cannot drift from the audit.

```sh
cd video && npm i
npx remotion studio            # preview and scrub
npx remotion render src/index.ts ScanProofDemo out/scanproof-demo.mp4 --codec=h264
```

`SCRIPT.md` is the voiceover, written against the same timecodes as `SCENES` in
`src/theme.ts`. Record to that and the visuals land with the narration.

## Regenerating the data

```sh
# from the repo root, after `make audit && make shift && make demo`
.venv/bin/python -c "..."   # see the export block in the project history
```

## Structure

| File | Role |
|---|---|
| `src/theme.ts` | Design tokens shared with the product, and the scene timeline |
| `src/parts.tsx` | Sheet, stamp, counter, plate — the reusable pieces |
| `src/scenes/` | One file per act |
| `src/data.json` | Real figures exported from `artifacts/` |

**Research prototype — not for diagnosis, not a medical device, no clinical validation.**
