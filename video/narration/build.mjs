/**
 * Measures the voiceover and derives the edit from it.
 *
 *   node narration/build.mjs --measure-only
 *
 * Timing a video by eye and hoping the narration fits is backwards. This reads
 * every clip in public/vo/, measures it, and writes src/vo.json — the
 * composition lays scenes out from those durations, so the cut can never drift
 * from the read. Change a pause in narration/script.json, re-synthesise, run
 * this, and the scene resizes itself.
 *
 * Audio normally comes from `narration/synth.py` (Kokoro). `--measure-only` is
 * also the path for a human recording: drop same-named .wav files into
 * public/vo/ and run it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const doc = JSON.parse(readFileSync(path.resolve("narration/script.json"), "utf8"));
const OUT = path.resolve("public/vo");

const durationOf = (file) =>
  Number(
    execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
    ]).toString().trim(),
  );

const lines = [];
for (const beat of doc.beats) {
  for (const line of beat.lines) {
    const wav = path.join(OUT, `${line.id}.wav`);
    if (!existsSync(wav)) {
      throw new Error(`missing ${wav} — run: python narration/synth.py`);
    }
    lines.push({
      id: line.id,
      scene: beat.scene,
      text: line.text,
      file: `vo/${line.id}.wav`,
      duration: durationOf(wav),
    });
  }
}

const total = lines.reduce((a, l) => a + l.duration, 0);
writeFileSync(
  path.resolve("src/vo.json"),
  JSON.stringify({ voice: doc.voice, speed: doc.speed, total, lines }, null, 1),
);

for (const l of lines) {
  console.log(`  ${l.scene.padEnd(12)}${l.id.padEnd(18)}${l.duration.toFixed(2)}s`);
}
const mm = Math.floor(total / 60);
console.log(`\ntotal ${mm}:${(total % 60).toFixed(1).padStart(4, "0")} · ${lines.length} lines · wrote src/vo.json`);
