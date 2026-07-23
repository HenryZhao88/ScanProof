import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { EASE, FieldLabel, Headline, Sheet, Stamp } from "../parts";
import data from "../data.json";

const CHECKS = [
  { n: "01", name: "Typicality", asks: "Has the model seen inputs like this?" },
  { n: "02", name: "Stability", asks: "Does the answer survive harmless changes?" },
  { n: "03", name: "Agreement", asks: "Do independently trained models concur?" },
  { n: "04", name: "Confidence", asks: "How far from the decision boundary?" },
];

/**
 * What the product is. The four checks arrive one per beat, then the stamp
 * lands — establishing the vocabulary the rest of the video uses.
 */
export const Checks: React.FC = () => {
  const frame = useCurrentFrame();
  const adult = data.adult;

  return (
    <Sheet slug="ScanProof · deployment guardrail">
      <AbsoluteFill style={{ padding: "140px 120px 130px" }}>
        <Headline size={76} style={{ maxWidth: 1400 }}>
          Four independent checks on every prediction.
        </Headline>

        <div style={{ marginTop: 46, display: "flex", flexDirection: "column" }}>
          {CHECKS.map((c, i) => {
            const at = 95 + i * 105;
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
              opacity: interpolate(frame, [560, 585], [0, 1], {
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
            <Stamp verdict={adult.verdict} at={600} scale={0.82} />
          </div>
        </div>
      </AbsoluteFill>
    </Sheet>
  );
};
