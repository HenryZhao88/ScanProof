/**
 * Builds the voiceover and derives the edit from it.
 *
 * Timing a video by eye and then hoping the narration fits is backwards. This
 * synthesises each line, measures what it actually takes, and writes those
 * durations to src/vo.json — the composition lays scenes out from that, so the
 * cut can never drift from the read.
 *
 *   node narration/build.mjs                 # default voice
 *   node narration/build.mjs --voice Daniel  # en_GB alternative
 *
 * To use a human recording instead: drop same-named .wav files into
 * public/vo/ and run `node narration/build.mjs --measure-only`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
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

/**
 * One entry per beat. `id` matches the scene key in src/theme.ts.
 * Punchy and short: fragments read better than clauses at this pace.
 */
const LINES = [
  ["hook", "Ninety-nine point nine percent confident. On a patient it has never seen."],
  [
    "problem",
    "A softmax has two outputs. Pneumonia. Normal. There is no third option that says, I don't recognise this input.",
  ],
  ["title", "ScanProof. A deployment guardrail for medical imaging models."],
  [
    "checks",
    "Four independent checks on every prediction. Typicality. Stability. Agreement. Confidence. Pass, review, or block, with the measurement behind it.",
  ],
  [
    "fragileSetup",
    "Here is why one number is not enough. This film is normal, at ninety percent confidence.",
  ],
  [
    "fragilePayoff",
    "Change the gamma. A windowing difference no radiologist would report differently. The model changes its answer. Five of twenty-one perturbations flip the label.",
  ],
  [
    "deploySetup",
    "Now the failure that ends deployments. Trained on pediatric films in Guangzhou. Run on adults at the N I H.",
  ],
  [
    "deployConfidence",
    "Watch the model first. Ninety-three point six, down to eighty-six. It barely moves. On breast ultrasound, not even a chest X-ray, it climbs back up.",
  ],
  [
    "deployGuardrail",
    "Now watch the guardrail. Typicality goes from the fiftieth percentile to the ninety-eighth. The pass rate falls from sixty-two percent to four point eight.",
  ],
  ["labelFree", "Neither number needs a label. Both are properties of the input."],
  [
    "control",
    "Is it just resolution? A control arm puts the pediatric films through the adult set's exact resampling path. One point. One point. It is the population, not the pixels.",
  ],
  [
    "whyFour",
    "Confidence is the best in-distribution error ranker. Embedding distance is the best shift detector. Neither is good at both, and we publish the regime where our own composite loses.",
  ],
  [
    "wires",
    "Different failures trip different wires. Here, typicality caught it alone. On the fragile film, stability did.",
  ],
  [
    "rigor",
    "Thresholds frozen before the test split was scored. Public benchmark data throughout. Ninety tests, and thirty-two preflight checks that re-run every case and diff the result.",
  ],
  ["close", "ScanProof. Four checks. One decision. And the evidence behind it."],
];

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
