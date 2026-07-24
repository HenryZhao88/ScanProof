/**
 * Measures the voiceover and derives the edit from it.
 *
 * Timing a video by eye and then hoping the narration fits is backwards. This
 * measures what each line actually takes and writes those durations to
 * src/vo.json — the composition lays scenes out from that, so the cut can never
 * drift from the read.
 *
 * Audio normally comes from `narration/synth.py` (Kokoro). This script only
 * measures it:
 *
 *   python narration/synth.py --voice af_heart
 *   node narration/build.mjs --measure-only
 *
 * `--measure-only` is also the path for a human recording: drop same-named
 * .wav files into public/vo/ and run it. Without the flag this falls back to
 * macOS `say`, which is fast but audibly synthetic — kept only so the pipeline
 * still runs where Kokoro is unavailable.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i === -1 ? d : args[i + 1];
};
const measureOnly = args.includes("--measure-only");

const VOICE = arg("voice", "Samantha");
/** Words per minute. Brisk — this is a pitch, not a lecture. */
const RATE = Number(arg("rate", 190));
/** Silence appended so a cut never lands on the tail of a word. */
const TAIL = 0.32;

const OUT = path.resolve("public/vo");
mkdirSync(OUT, { recursive: true });

const LINES = JSON.parse(
  readFileSync(path.resolve("narration/lines.json"), "utf8"),
).map((l) => [l.id, l.text]);

const durationOf = (file) =>
  Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ])
      .toString()
      .trim(),
  );

const manifest = [];
for (const [id, text] of LINES) {
  const wav = path.join(OUT, `${id}.wav`);

  if (!measureOnly) {
    const aiff = path.join(OUT, `${id}.aiff`);
    execFileSync("say", ["-v", VOICE, "-r", String(RATE), "-o", aiff, text]);
    // 48 kHz mono, plus a beat of silence so cuts breathe
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      aiff,
      "-af",
      `apad=pad_dur=${TAIL}`,
      "-ar",
      "48000",
      "-ac",
      "1",
      wav,
    ]);
    execFileSync("rm", [aiff]);
  }

  if (!existsSync(wav)) throw new Error(`missing ${wav}`);
  const duration = durationOf(wav);
  manifest.push({ id, text, file: `vo/${id}.wav`, duration });
  console.log(`${id.padEnd(18)} ${duration.toFixed(2)}s  ${text.slice(0, 54)}…`);
}

const total = manifest.reduce((a, m) => a + m.duration, 0);
writeFileSync(
  path.resolve("src/vo.json"),
  JSON.stringify({ voice: VOICE, rate: RATE, total, lines: manifest }, null, 1),
);

const mm = Math.floor(total / 60);
const ss = (total % 60).toFixed(1).padStart(4, "0");
console.log(`\ntotal narration ${mm}:${ss}  ·  ${manifest.length} beats  ·  wrote src/vo.json`);
