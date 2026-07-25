import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { EASE, enter, FieldLabel, Sheet, Stamp } from "../parts";
import data from "../data.json";

/**
 * The plain question leads; the technical name sits beside it as a label. A
 * judge who has never heard "typicality" follows the question, and one who has
 * still sees the right term.
 */
const CHECKS = [
  { n: "01", name: "Typicality", asks: "Has it seen images like this before?" },
  { n: "02", name: "Stability", asks: "Nudge the picture — does it change its mind?" },
  { n: "03", name: "Agreement", asks: "Do three separate models agree?" },
  { n: "04", name: "Confidence", asks: "Or is this close to a coin flip?" },
];

/**
 * What the product is. The four checks arrive one per beat, then the stamp
 * lands — establishing the vocabulary the rest of the video uses.
 */
export const Checks: React.FC = () => {
  const frame = useCurrentFrame();
  const adult = data.adult;

  return (
    <Sheet slug="The guardrail">
      <AbsoluteFill style={{ padding: "140px 120px 130px" }}>
        <div style={{ opacity: enter(frame, 0, 7) }}>
          <span
            style={{
              fontFamily: F.display,
              fontSize: 68,
              fontWeight: 700,
              letterSpacing: "-0.035em",
              color: C.ink,
            }}
          >
            ScanProof
          </span>
          <span
            style={{
              fontFamily: F.display,
              fontSize: 68,
              fontWeight: 500,
              letterSpacing: "-0.025em",
              color: C.graphite,
            }}
          >
            {" "}asks its own four questions.
          </span>
        </div>

        <div style={{ marginTop: 46, display: "flex", flexDirection: "column" }}>
          {CHECKS.map((c, i) => {
            const at = 16 + i * 34;
            return (
              <div
                key={c.n}
                style={{
                  display: "grid",
                  gridTemplateColumns: "88px 380px 1fr",
                  alignItems: "baseline",
                  gap: 28,
                  padding: "18px 0",
                  borderBottom: `1px solid ${C.rule}`,
                  opacity: interpolate(frame, [at, at + 13], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: EASE,
                  }),
                  translate: `${interpolate(frame, [at, at + 13], [-26, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: EASE,
                  })}px 0px`,
                }}
              >
                <span
                  style={{
                    fontFamily: F.mono,
                    fontSize: 26,
                    color: C.faint,
                  }}
                >
                  {c.n}
                </span>
                <span
                  style={{
                    fontFamily: F.display,
                    fontSize: 46,
                    fontWeight: 600,
                    color: C.ink,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {c.name}
                </span>
                <span
                  style={{
                    fontFamily: F.display,
                    fontSize: 32,
                    color: C.graphite,
                  }}
                >
                  {c.asks}
                </span>
              </div>
            );
          })}
        </div>

        {/* the decision */}
        <div
          style={{
            marginTop: 44,
            display: "flex",
            alignItems: "center",
            gap: 64,
          }}
        >
          <div
            style={{
              opacity: interpolate(frame, [168, 186], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE,
              }),
            }}
          >
            <FieldLabel>The output is a decision</FieldLabel>
            <div
              style={{
                marginTop: 16,
                fontFamily: F.display,
                fontSize: 40,
                fontWeight: 500,
                color: C.ink,
              }}
            >
              PASS · REVIEW · BLOCK
              <span style={{ color: C.graphite }}> — and the measurement behind it.</span>
            </div>
          </div>

          <div style={{ marginLeft: "auto" }}>
            <Stamp verdict={adult.verdict} at={186} scale={0.82} />
          </div>
        </div>
      </AbsoluteFill>
    </Sheet>
  );
};
