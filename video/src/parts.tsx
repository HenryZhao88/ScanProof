import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, F, SAFE, VERDICT_CAPTION, VERDICT_GLYPH, VERDICT_INK } from "./theme";

/** Standard ease for everything that enters. */
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const useFadeIn = (start: number, len = 12) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, start + len], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
};

/** The page. Paper ground, persistent disclaimer, section slug. */
export const Sheet: React.FC<{
  slug?: string;
  children: React.ReactNode;
}> = ({ slug, children }) => (
  <AbsoluteFill style={{ backgroundColor: C.ground, fontFamily: F.display }}>
    <AbsoluteFill style={{ padding: SAFE }}>{children}</AbsoluteFill>

    {slug ? (
      <div
        style={{
          position: "absolute",
          top: 54,
          left: SAFE,
          fontFamily: F.display,
          fontSize: 19,
          fontWeight: 600,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: C.faint,
        }}
      >
        {slug}
      </div>
    ) : null}

    {/* Fixed on every frame, exactly as in the product. */}
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        borderTop: `1px solid ${C.rule}`,
        backgroundColor: C.sheet2,
        padding: "14px 0",
        textAlign: "center",
        fontFamily: F.display,
        fontSize: 19,
        color: C.graphite,
      }}
    >
      <span style={{ fontWeight: 600, color: C.ink }}>
        Research prototype — not for diagnosis.
      </span>{" "}
      Not a medical device. No clinical validation.
    </div>
  </AbsoluteFill>
);

/** Big statement type. */
export const Headline: React.FC<{
  children: React.ReactNode;
  size?: number;
  style?: React.CSSProperties;
}> = ({ children, size = 88, style }) => (
  <div
    style={{
      fontFamily: F.display,
      fontSize: size,
      fontWeight: 700,
      lineHeight: 1.08,
      letterSpacing: "-0.03em",
      color: C.ink,
      ...style,
    }}
  >
    {children}
  </div>
);

export const FieldLabel: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color = C.faint,
}) => (
  <div
    style={{
      fontFamily: F.display,
      fontSize: 20,
      fontWeight: 600,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color,
    }}
  >
    {children}
  </div>
);

/** A radiograph, mounted. */
export const Plate: React.FC<{ src: string; size: number; style?: React.CSSProperties }> = ({
  src,
  size,
  style,
}) => (
  <div style={{ backgroundColor: C.plate, padding: 14, ...style }}>
    <Img
      src={staticFile(`plates/${src}`)}
      style={{ width: size, height: size, display: "block" }}
    />
  </div>
);

/**
 * The verdict stamp. One impression — a slight overshoot on landing and then
 * nothing. Anything bouncier reads as a costume rather than an instrument.
 */
export const Stamp: React.FC<{ verdict: string; at: number; scale?: number }> = ({
  verdict,
  at,
  scale = 1,
}) => {
  const frame = useCurrentFrame();
  const ink = VERDICT_INK[verdict];
  const t = interpolate(frame, [at, at + 7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.3, 1.4, 0.5, 1),
  });

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4 * scale,
        padding: `${16 * scale}px ${46 * scale}px ${14 * scale}px`,
        border: `${5 * scale}px solid ${ink}`,
        boxShadow: `inset 0 0 0 ${3 * scale}px ${C.sheet}, inset 0 0 0 ${7 * scale}px ${ink}`,
        borderRadius: 6 * scale,
        color: ink,
        opacity: t,
        rotate: "-2.5deg",
        scale: interpolate(t, [0, 1], [1.18, 1]) as unknown as string,
      }}
    >
      <div
        style={{
          fontFamily: F.display,
          fontWeight: 700,
          fontSize: 62 * scale,
          lineHeight: 1,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ fontSize: 44 * scale, marginRight: 16 * scale }}>
          {VERDICT_GLYPH[verdict]}
        </span>
        {verdict}
      </div>
      <div
        style={{
          fontFamily: F.mono,
          fontSize: 17 * scale,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          opacity: 0.75,
        }}
      >
        {VERDICT_CAPTION[verdict]}
      </div>
    </div>
  );
};

/** A number that counts up into place. Mono, tabular. */
export const Counter: React.FC<{
  from: number;
  to: number;
  at: number;
  dur?: number;
  decimals?: number;
  suffix?: string;
  size?: number;
  color?: string;
}> = ({ from, to, at, dur = 24, decimals = 1, suffix = "", size = 96, color = C.ink }) => {
  const frame = useCurrentFrame();
  const v = interpolate(frame, [at, at + dur], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  return (
    <span
      style={{
        fontFamily: F.mono,
        fontVariantNumeric: "tabular-nums",
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "-0.03em",
        color,
      }}
    >
      {v.toFixed(decimals)}
      {suffix ? <span style={{ fontSize: size * 0.44, color: C.faint }}>{suffix}</span> : null}
    </span>
  );
};

/** A screenshot of the real product, held inside a page frame. */
export const Shot: React.FC<{
  src: string;
  at: number;
  /** 0-1 focal point to drift toward, for a slow push. */
  zoom?: number;
}> = ({ src, at, zoom = 1.04 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div
      style={{
        border: `1px solid ${C.rule}`,
        boxShadow: "0 18px 50px rgba(16,22,28,0.13)",
        overflow: "hidden",
        opacity: interpolate(frame, [at, at + 14], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        }),
      }}
    >
      <Img
        src={staticFile(`shots/${src}`)}
        style={{
          width: "100%",
          display: "block",
          scale: interpolate(frame, [at, durationInFrames], [1, zoom], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) as unknown as string,
        }}
      />
    </div>
  );
};
