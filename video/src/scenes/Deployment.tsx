import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Counter, EASE, FieldLabel, Headline, Sheet } from "../parts";
import data from "../data.json";
import { sceneOf } from "../timeline";

const W = 1000;
const H = 470;
const PAD = { top: 30, right: 258, bottom: 96, left: 78 };

const SHORT = [
  ["pediatric", "native res"],
  ["pediatric", "resampled"],
  ["ADULT", "other hospital"],
  ["ultrasound", "wrong modality"],
];

/**
 * The centrepiece. Four populations ordered by distance from the training
 * distribution; two quantities, both percentages, so they share one axis.
 *
 * The model's confidence is drawn first and runs flat. Only then does the pass
 * rate draw, and the gap between them opens on screen. Sequencing the two
 * traces is what turns a chart into an argument.
 */
export const Deployment: React.FC = () => {
  const frame = useCurrentFrame();
  const { cue } = sceneOf("deployment");
  const arms = data.arms;
  const ped = arms[1];
  const adult = arms[2];

  const sx = (i: number) => PAD.left + (i / 3) * (W - PAD.left - PAD.right);
  const sy = (v: number) => PAD.top + (1 - v) * (H - PAD.top - PAD.bottom);

  const line = (get: (a: (typeof arms)[number]) => number) =>
    arms.map((a, i) => `${i ? "L" : "M"}${sx(i)},${sy(get(a))}`).join(" ");

  const confDraw = interpolate(frame, [cue.deployConfidence + 8, cue.deployConfidence + 54], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  // Width of the reveal window for the pass-rate trace, in user units.
  const passReveal = interpolate(frame, [cue.deployGuardrail + 30, cue.deployGuardrail + 96], [PAD.left, W], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const gapOpacity = interpolate(frame, [cue.deployGuardrail + 96, cue.deployGuardrail + 140], [0, 0.09], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Sheet slug="The deployment test">
      <AbsoluteFill style={{ padding: "140px 120px 120px" }}>
        <Headline size={64} style={{ maxWidth: 1500 }}>
          Trained on children. Run on adults.
        </Headline>
        <div
          style={{
            marginTop: 16,
            fontFamily: F.display,
            fontSize: 29,
            color: C.graphite,
            maxWidth: 1300,
            opacity: interpolate(frame, [10, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
          }}
        >
          Same kind of scan, completely different patients. Neither number below needs to know
          the right answer.
        </div>

        <div style={{ display: "flex", gap: 60, marginTop: 34, alignItems: "flex-start" }}>
          <svg width={W} height={H} style={{ display: "block", flexShrink: 0 }}>
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} stroke={C.rule} />
                <text
                  x={PAD.left - 12}
                  y={sy(t) + 6}
                  textAnchor="end"
                  fontFamily={F.mono}
                  fontSize={17}
                  fill={C.faint}
                >
                  {(t * 100).toFixed(0)}%
                </text>
              </g>
            ))}

            {/* the gap between the two traces is the finding */}
            <path
              d={`${line((a) => a.confidence)} ${arms
                .map((_, i) => {
                  const j = arms.length - 1 - i;
                  return `L${sx(j)},${sy(arms[j].pass)}`;
                })
                .join(" ")} Z`}
              fill={C.block}
              fillOpacity={gapOpacity}
            />

            {arms.map((a, i) => (
              <g key={a.label}>
                <line
                  x1={sx(i)}
                  x2={sx(i)}
                  y1={PAD.top}
                  y2={H - PAD.bottom}
                  stroke={C.rule}
                  strokeDasharray="3 5"
                />
                {SHORT[i].map((t, li) => (
                  <text
                    key={li}
                    x={sx(i)}
                    y={H - PAD.bottom + 28 + li * 22}
                    textAnchor="middle"
                    fontFamily={F.mono}
                    fontSize={li === 0 ? 19 : 17}
                    fontWeight={i === 2 && li === 0 ? 600 : 400}
                    fill={li === 0 ? C.graphite : C.faint}
                  >
                    {t}
                  </text>
                ))}
                <text
                  x={sx(i)}
                  y={H - PAD.bottom + 72}
                  textAnchor="middle"
                  fontFamily={F.mono}
                  fontSize={15}
                  fill={C.faint}
                >
                  n={a.n}
                </text>
              </g>
            ))}

            {/* confidence — flat */}
            <path
              d={line((a) => a.confidence)}
              fill="none"
              stroke={C.block}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={confDraw}
            />
            {/* pass rate — collapses */}
            <path
              d={line((a) => a.pass)}
              fill="none"
              stroke={C.pass}
              strokeWidth={4}
              strokeDasharray="10 7"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={interpolate(frame, [cue.deployGuardrail + 30, cue.deployGuardrail + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
              clipPath="url(#passClip)"
            />
            <defs>
              <clipPath id="passClip">
                <rect
                  x={0}
                  y={0}
                  width={passReveal}
                  height={H}
                />
              </clipPath>
            </defs>

            {arms.map((a, i) => (
              <g key={`m${i}`}>
                <circle
                  cx={sx(i)}
                  cy={sy(a.confidence)}
                  r={7}
                  fill={C.block}
                  stroke={C.sheet}
                  strokeWidth={3}
                  paintOrder="stroke"
                  opacity={interpolate(frame, [cue.deployConfidence + 8 + i * 14, cue.deployConfidence + 22 + i * 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
                />
                <circle
                  cx={sx(i)}
                  cy={sy(a.pass)}
                  r={7}
                  fill={C.pass}
                  stroke={C.sheet}
                  strokeWidth={3}
                  paintOrder="stroke"
                  opacity={interpolate(frame, [cue.deployGuardrail + 34 + i * 17, cue.deployGuardrail + 50 + i * 17], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
                />
              </g>
            ))}

            <text
              x={W - PAD.right + 16}
              y={sy(arms[3].confidence) + 7}
              fontFamily={F.mono}
              fontSize={19}
              fill={C.block}
              opacity={interpolate(frame, [cue.deployConfidence + 56, cue.deployConfidence + 74], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
            >
              model confidence
            </text>
            <text
              x={W - PAD.right + 16}
              y={sy(arms[3].pass) + 7}
              fontFamily={F.mono}
              fontSize={19}
              fill={C.passInk}
              opacity={interpolate(frame, [cue.deployGuardrail + 96, cue.deployGuardrail + 116], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
            >
              ScanProof PASS rate
            </text>
          </svg>

          <div style={{ flex: 1, minWidth: 0, paddingTop: 8 }}>
            <Readout
              label="Model confidence"
              at={cue.deployConfidence + 40}
              from={ped.confidence * 100}
              to={adult.confidence * 100}
              suffix="%"
              color={C.blockInk}
              note="Barely moves. It climbs again on ultrasound."
            />
            <Readout
              label="Embedding percentile"
              at={cue.deployGuardrail + 18}
              from={ped.ood * 100}
              to={adult.ood * 100}
              color={C.plot}
              note="The typicality check does notice."
            />
            <Readout
              label="ScanProof pass rate"
              at={cue.deployGuardrail + 92}
              from={ped.pass * 100}
              to={adult.pass * 100}
              suffix="%"
              color={C.passInk}
              note="What the guardrail does about it."
              last
            />
          </div>
        </div>
      </AbsoluteFill>
    </Sheet>
  );
};

const Readout: React.FC<{
  label: string;
  at: number;
  from: number;
  to: number;
  suffix?: string;
  color: string;
  note: string;
  last?: boolean;
}> = ({ label, at, from, to, suffix = "", color, note, last }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        paddingBottom: 17,
        marginBottom: 17,
        borderBottom: last ? "none" : `1px solid ${C.rule}`,
        opacity: interpolate(frame, [at - 10, at], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
      }}
    >
      <FieldLabel>{label}</FieldLabel>
      <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 16 }}>
        <span style={{ fontFamily: F.mono, fontSize: 46, color: C.graphite, letterSpacing: "-0.02em" }}>
          {from.toFixed(1)}
          {suffix}
        </span>
        <span style={{ fontFamily: F.mono, fontSize: 34, color: C.faint }}>→</span>
        <Counter from={from} to={to} at={at} dur={26} suffix={suffix} size={56} color={color} />
      </div>
      <div style={{ marginTop: 8, fontFamily: F.display, fontSize: 23, color: C.graphite }}>
        {note}
      </div>
    </div>
  );
};
