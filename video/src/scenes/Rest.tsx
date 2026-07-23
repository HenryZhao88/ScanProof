import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { EASE, FieldLabel, Headline, Sheet, Stamp } from "../parts";
import data from "../data.json";
import { sceneOf } from "../timeline";

/* ------------------------------------------------------------------ control */

/**
 * The confound, answered before anyone has to raise it. Two pediatric rows
 * through different resampling paths, and the deltas between them.
 */
export const Control: React.FC = () => {
  const frame = useCurrentFrame();
  const ctrl = data.control;
  const deltas: [string, number][] = [
    ["Pass rate", ctrl.pass_rate_delta],
    ["Accuracy", ctrl.accuracy_delta],
    ["Confidence", ctrl.confidence_delta],
    ["Embedding percentile", ctrl.ood_percentile_delta],
  ];

  return (
    <Sheet slug="Confound control">
      <AbsoluteFill style={{ padding: "170px 120px 170px", justifyContent: "center" }}>
        <Headline size={64} style={{ maxWidth: 1400 }}>
          Is it just a resolution artifact?
        </Headline>
        <div
          style={{
            marginTop: 22,
            fontFamily: F.display,
            fontSize: 31,
            lineHeight: 1.45,
            color: C.graphite,
            maxWidth: 1250,
            opacity: interpolate(frame, [10, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
          }}
        >
          A control arm puts the <strong style={{ color: C.ink }}>pediatric</strong> films through
          the adult set’s exact resampling path. If those two rows disagreed, the study would be
          measuring image processing.
        </div>

        <div style={{ marginTop: 58, display: "flex", gap: 70, flexWrap: "wrap" }}>
          {deltas.map(([label, v], i) => {
            const at = 44 + i * 16;
            return (
              <div
                key={label}
                style={{
                  opacity: interpolate(frame, [at, at + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
                  translate: `0px ${interpolate(frame, [at, at + 14], [16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE })}px`,
                }}
              >
                <FieldLabel>{label} Δ</FieldLabel>
                <div
                  style={{
                    marginTop: 12,
                    fontFamily: F.mono,
                    fontSize: 66,
                    letterSpacing: "-0.03em",
                    color: Math.abs(v) < 0.05 ? C.passInk : C.reviewInk,
                  }}
                >
                  {v >= 0 ? "+" : "−"}
                  {(Math.abs(v) * 100).toFixed(1)}
                  <span style={{ fontSize: 28, color: C.faint }}> pts</span>
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 66,
            borderTop: `2px solid ${C.ink}`,
            paddingTop: 30,
            fontFamily: F.display,
            fontSize: 46,
            fontWeight: 600,
            color: C.ink,
            opacity: interpolate(frame, [188, 212], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
          }}
        >
          It is the population, not the pixels.
        </div>
      </AbsoluteFill>
    </Sheet>
  );
};

/* -------------------------------------------------------------- four checks */

const SW = 780;
const SH = 480;
const SPAD = { top: 40, right: 40, bottom: 84, left: 96 };

/**
 * Why four checks and not a favourite. Each signal is one point; the axes are
 * the two things that go wrong. The shaded corner is everything that would beat
 * the composite on both axes at once, and it is empty.
 */
export const FourChecks: React.FC = () => {
  const frame = useCurrentFrame();
  const { cue } = sceneOf("whyFour");
  const rows = data.two_regime.rows;

  const xs = rows.map((r) => r.shift_detection_auroc);
  const ys = rows.map((r) => r.in_distribution_aurc);
  const xMin = Math.min(0.45, Math.min(...xs) - 0.04);
  const xMax = 1.0;
  const yMin = Math.max(0, Math.min(...ys) - 0.004);
  const yMax = Math.max(...ys) + 0.006;

  const sx = (v: number) => SPAD.left + ((v - xMin) / (xMax - xMin)) * (SW - SPAD.left - SPAD.right);
  const sy = (v: number) => SPAD.top + ((v - yMin) / (yMax - yMin)) * (SH - SPAD.top - SPAD.bottom);

  const comp = rows.find((r) => r.is_composite)!;

  const LABEL: Record<string, { side: "l" | "r"; dy: number }> = {
    "Model confidence": { side: "r", dy: -4 },
    "Perturbation instability": { side: "l", dy: 0 },
    "ScanProof composite": { side: "r", dy: -14 },
    "Ensemble disagreement": { side: "r", dy: 18 },
    "Embedding percentile": { side: "l", dy: 0 },
  };

  return (
    <Sheet slug="Why four checks, not one">
      <AbsoluteFill style={{ padding: "140px 120px 120px" }}>
        <Headline size={62} style={{ maxWidth: 1450 }}>
          No single signal is good at both failure modes.
        </Headline>

        <div style={{ display: "flex", gap: 70, marginTop: 40, alignItems: "flex-start" }}>
          <svg width={SW} height={SH} style={{ flexShrink: 0 }}>
            <rect
              x={sx(comp.shift_detection_auroc)}
              y={SPAD.top}
              width={SW - SPAD.right - sx(comp.shift_detection_auroc)}
              height={sy(comp.in_distribution_aurc) - SPAD.top}
              fill={C.pass}
              fillOpacity={interpolate(frame, [150, 180], [0, 0.1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
              stroke={C.pass}
              strokeOpacity={interpolate(frame, [150, 180], [0, 0.45], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
              strokeDasharray="5 4"
            />
            <text
              x={SW - SPAD.right - 14}
              y={SPAD.top + 24}
              textAnchor="end"
              fontFamily={F.mono}
              fontSize={20}
              fill={C.passInk}
              opacity={interpolate(frame, [182, 202], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
            >
              no signal here
            </text>

            <line x1={SPAD.left} x2={SW - SPAD.right} y1={SH - SPAD.bottom} y2={SH - SPAD.bottom} stroke={C.rule} />
            <line x1={SPAD.left} x2={SPAD.left} y1={SPAD.top} y2={SH - SPAD.bottom} stroke={C.rule} />
            {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((t) => (
              <text
                key={t}
                x={sx(t)}
                y={SH - SPAD.bottom + 26}
                textAnchor="middle"
                fontFamily={F.mono}
                fontSize={16}
                fill={C.faint}
              >
                {t.toFixed(2)}
              </text>
            ))}
            <text
              x={(SPAD.left + SW - SPAD.right) / 2}
              y={SH - 22}
              textAnchor="middle"
              fontFamily={F.display}
              fontSize={19}
              fontWeight={600}
              letterSpacing="0.1em"
              fill={C.faint}
            >
              SHIFT DETECTION AUROC →
            </text>
            <text
              x={26}
              y={(SPAD.top + SH - SPAD.bottom) / 2}
              textAnchor="middle"
              fontFamily={F.display}
              fontSize={19}
              fontWeight={600}
              letterSpacing="0.1em"
              fill={C.faint}
              transform={`rotate(-90 26 ${(SPAD.top + SH - SPAD.bottom) / 2})`}
            >
              ← BETTER IN-DIST RANKING
            </text>

            {rows.map((r, i) => {
              const at = 24 + i * 18;
              const cx = sx(r.shift_detection_auroc);
              const cy = sy(r.in_distribution_aurc);
              const o = interpolate(frame, [at, at + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
              const place = LABEL[r.signal] ?? { side: "r" as const, dy: 0 };
              const flip = place.side === "l";
              return (
                <g key={r.signal} opacity={o}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r.is_composite ? 12 : 8}
                    fill={r.is_composite ? C.pass : C.plot}
                    stroke={C.sheet}
                    strokeWidth={3}
                    paintOrder="stroke"
                  />
                  <text
                    x={flip ? cx - 18 : cx + 18}
                    y={cy + 7 + place.dy}
                    textAnchor={flip ? "end" : "start"}
                    fontFamily={F.mono}
                    fontSize={20}
                    fontWeight={r.is_composite ? 600 : 400}
                    fill={r.is_composite ? C.passInk : C.graphite}
                  >
                    {r.signal}
                  </text>
                </g>
              );
            })}
          </svg>

          <div style={{ flex: 1, minWidth: 0, paddingTop: 10 }}>
            <div
              style={{
                fontFamily: F.display,
                fontSize: 30,
                lineHeight: 1.5,
                color: C.graphite,
                opacity: interpolate(frame, [14, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
              }}
            >
              Confidence is the best in-distribution error ranker we measured. Embedding distance
              is the best shift detector. Neither is good at both.
            </div>

            <div
              style={{
                marginTop: 34,
                border: `1px solid ${C.review}`,
                background: "rgba(192,133,26,0.07)",
                padding: "26px 30px",
                opacity: interpolate(frame, [212, 238], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
              }}
            >
              <FieldLabel color={C.reviewInk}>Reported as found</FieldLabel>
              <div
                style={{
                  marginTop: 14,
                  fontFamily: F.display,
                  fontSize: 28,
                  lineHeight: 1.5,
                  color: C.ink,
                }}
              >
                Under margins fixed before the study ran,{" "}
                <strong>no signal clears both regimes — including ours.</strong> We publish the
                regime where our own composite loses.
              </div>
            </div>

            <div
              style={{
                marginTop: 34,
                fontFamily: F.display,
                fontSize: 30,
                lineHeight: 1.5,
                color: C.ink,
                opacity: interpolate(frame, [cue.wires, cue.wires + 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
              }}
            >
              Different failures trip different wires. Here, typicality caught it alone. On the
              fragile film, stability did.
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </Sheet>
  );
};

/* -------------------------------------------------------------------- rigor */

export const Rigor: React.FC = () => {
  const frame = useCurrentFrame();
  const facts: [string, string][] = [
    ["Thresholds", "frozen on a validation split before the test split or any shift arm was scored"],
    ["Data", "PneumoniaMNIST · ChestMNIST · BreastMNIST — public benchmarks, CC BY 4.0"],
    ["Artifacts", "every figure written by scanproof.evaluate and scanproof.shift, committed"],
    ["Checks", "90 tests · 32 preflight checks that re-run each demo case and diff the cache"],
  ];

  return (
    <Sheet slug="How it was built">
      <AbsoluteFill style={{ padding: "180px 120px 170px", justifyContent: "center" }}>
        <Headline size={64} style={{ maxWidth: 1400 }}>
          Nothing here was tuned on what it reports.
        </Headline>

        <div style={{ marginTop: 56 }}>
          {facts.map(([k, v], i) => {
            const at = 16 + i * 38;
            return (
              <div
                key={k}
                style={{
                  display: "grid",
                  gridTemplateColumns: "280px 1fr",
                  gap: 34,
                  alignItems: "baseline",
                  padding: "24px 0",
                  borderBottom: `1px solid ${C.rule}`,
                  opacity: interpolate(frame, [at, at + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
                }}
              >
                <span
                  style={{
                    fontFamily: F.display,
                    fontSize: 22,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: C.faint,
                  }}
                >
                  {k}
                </span>
                <span style={{ fontFamily: F.display, fontSize: 32, color: C.ink, lineHeight: 1.4 }}>
                  {v}
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 48,
            fontFamily: F.mono,
            fontSize: 30,
            color: C.plot,
            opacity: interpolate(frame, [196, 222], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
          }}
        >
          make reproduce && make preflight && make serve
        </div>
      </AbsoluteFill>
    </Sheet>
  );
};

/* -------------------------------------------------------------------- close */

export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Sheet>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 120 }}>
        <div
          style={{
            fontFamily: F.display,
            fontSize: 132,
            fontWeight: 700,
            letterSpacing: "-0.045em",
            color: C.ink,
            opacity: interpolate(frame, [2, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
          }}
        >
          ScanProof
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: F.display,
            fontSize: 42,
            color: C.graphite,
            textAlign: "center",
            opacity: interpolate(frame, [16, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
          }}
        >
          Four checks, one decision, and the evidence behind it.
        </div>

        <div style={{ marginTop: 58, display: "flex", gap: 40 }}>
          {(["PASS", "REVIEW", "BLOCK"] as const).map((v, i) => (
            <Stamp key={v} verdict={v} at={46 + i * 13} scale={0.52} />
          ))}
        </div>

        <div
          style={{
            marginTop: 76,
            paddingTop: 26,
            borderTop: `1px solid ${C.rule}`,
            maxWidth: 1080,
            textAlign: "center",
            fontFamily: F.display,
            fontSize: 24,
            lineHeight: 1.55,
            color: C.graphite,
            opacity: interpolate(frame, [104, 128], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
          }}
        >
          <span style={{ fontWeight: 600, color: C.ink }}>
            Research prototype — not for diagnosis.
          </span>{" "}
          Not a medical device, no clinical validation, no regulatory claim. Public
          de-identified benchmark data, CC BY 4.0.
        </div>
      </AbsoluteFill>
    </Sheet>
  );
};
