import vo from "./vo.json";

/**
 * The edit is derived from the narration, not guessed alongside it.
 *
 * `narration/build.mjs` synthesises each line and measures it; this turns those
 * measurements into scene boundaries. Re-record a line — or swap the whole
 * voiceover for a human take — and the cut follows automatically.
 */

export const FPS = 30;

type LineId = (typeof vo.lines)[number]["id"];

const byId = new Map(vo.lines.map((l) => [l.id, l]));
const dur = (id: string) => {
  const l = byId.get(id);
  if (!l) throw new Error(`no narration line "${id}"`);
  return l.duration;
};
export const file = (id: string) => byId.get(id)!.file;

/**
 * A scene is one or more narration lines plus a tail. The tail is where a
 * visual finishes landing after the voice stops — generous on the two chart
 * scenes, tight everywhere else so the thing keeps moving.
 */
const PLAN: { key: string; lines: LineId[]; tail: number }[] = [
  { key: "stake", lines: ["stake"], tail: 0.3 },
  { key: "hook", lines: ["proof"], tail: 0.4 },
  { key: "problem", lines: ["blind"], tail: 0.35 },
  { key: "checks", lines: ["checks"], tail: 0.6 },
  { key: "fragile", lines: ["fragileSetup", "fragilePayoff"], tail: 1.1 },
  { key: "deployment", lines: ["deploySetup", "deployConfidence", "deployGuardrail"], tail: 1.1 },
  { key: "labelFree", lines: ["labelFree"], tail: 0.5 },
  { key: "control", lines: ["control"], tail: 0.5 },
  { key: "whyFour", lines: ["whyFour", "wires"], tail: 0.9 },
  { key: "rigor", lines: ["rigor"], tail: 0.5 },
  { key: "close", lines: ["close"], tail: 1.4 },
];

export type Scene = {
  key: string;
  /** absolute start, in frames */
  from: number;
  durationInFrames: number;
  /** narration clips, with offsets relative to the scene start (frames) */
  audio: { file: string; at: number; durationInFrames: number }[];
  /** offset of each line's start within the scene, keyed by line id (frames) */
  cue: Record<string, number>;
};

const f = (seconds: number) => Math.round(seconds * FPS);

let cursor = 0;
export const SCENES: Scene[] = PLAN.map(({ key, lines, tail }) => {
  const audio: Scene["audio"] = [];
  const cue: Record<string, number> = {};
  let local = 0;
  for (const id of lines) {
    cue[id] = f(local);
    audio.push({ file: file(id), at: f(local), durationInFrames: f(dur(id)) });
    local += dur(id);
  }
  const scene: Scene = {
    key,
    from: cursor,
    durationInFrames: f(local + tail),
    audio,
    cue,
  };
  cursor += scene.durationInFrames;
  return scene;
});

export const TOTAL_FRAMES = cursor;

export const sceneOf = (key: string): Scene => {
  const s = SCENES.find((x) => x.key === key);
  if (!s) throw new Error(`no scene "${key}"`);
  return s;
};
