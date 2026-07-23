/**
 * The video inherits the product's design system exactly — certificate of
 * inspection. Same tokens, same two typefaces, same validated status triad.
 * A demo that looks like a different product than the app undercuts both.
 */

export const C = {
  ground: "#e9ebef",
  sheet: "#ffffff",
  sheet2: "#f5f6f8",
  plate: "#0b0e11",

  ink: "#10161c",
  graphite: "#5a6672",
  faint: "#8d97a2",
  rule: "#d3d8de",

  pass: "#3fae7c",
  review: "#c0851a",
  block: "#96121e",

  passInk: "#177249",
  reviewInk: "#7d5406",
  blockInk: "#96121e",

  plot: "#2b5fa8",
  plotSoft: "#8a939c",
} as const;

export const F = {
  display: '"Archivo", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
} as const;

/** 1920×1080. Keep key content inside this margin. */
export const SAFE = 120;

export const VERDICT_INK: Record<string, string> = {
  PASS: C.passInk,
  REVIEW: C.reviewInk,
  BLOCK: C.blockInk,
};
export const VERDICT_GLYPH: Record<string, string> = {
  PASS: "✓",
  REVIEW: "!",
  BLOCK: "✕",
};
export const VERDICT_CAPTION: Record<string, string> = {
  PASS: "released",
  REVIEW: "hold for review",
  BLOCK: "withheld",
};

/** Scene boundaries in seconds. The script is written against these. */
export const SCENES = {
  open: { from: 0, dur: 30 },
  what: { from: 30, dur: 30 },
  fragile: { from: 60, dur: 38 },
  deployment: { from: 98, dur: 58 },
  control: { from: 156, dur: 24 },
  fourChecks: { from: 180, dur: 42 },
  rigor: { from: 222, dur: 30 },
  close: { from: 252, dur: 18 },
} as const;

export const TOTAL_SECONDS = 270;
