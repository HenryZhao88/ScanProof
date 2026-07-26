import vo from "./vo.json";

/**
 * The edit is derived from the narration, not guessed alongside it.
 *
 * `narration/build.mjs` synthesises each line and measures it; this turns those
 * measurements into scene boundaries. Re-record a line — or swap the whole
 * voiceover for a human take — and the cut follows automatically.
 */

export const FPS = 30;

/**
 * Scene boundaries come straight from the script: lines are grouped by their
 * `scene`, and each line's length already includes its `pauseAfter`. So every
 * timing knob lives in narration/script.json and nothing is duplicated here.
 */
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

const order: string[] = [];
const grouped = new Map<string, typeof vo.lines>();
for (const line of vo.lines) {
  if (!grouped.has(line.scene)) {
    grouped.set(line.scene, []);
    order.push(line.scene);
  }
  grouped.get(line.scene)!.push(line);
}

let cursor = 0;
export const SCENES: Scene[] = order.map((key) => {
  const audio: Scene["audio"] = [];
  const cue: Record<string, number> = {};
  let local = 0;
  for (const line of grouped.get(key)!) {
    cue[line.id] = f(local);
    audio.push({ file: line.file, at: f(local), durationInFrames: f(line.duration) });
    local += line.duration;
  }
  const scene: Scene = { key, from: cursor, durationInFrames: f(local), audio, cue };
  cursor += scene.durationInFrames;
  return scene;
});

export const TOTAL_FRAMES = cursor;

export const sceneOf = (key: string): Scene => {
  const s = SCENES.find((x) => x.key === key);
  if (!s) throw new Error(`no scene "${key}"`);
  return s;
};
