import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { EASE, FieldLabel, Headline, Plate, Sheet } from "../parts";
import data from "../data.json";
import { sceneOf } from "../timeline";

type Row = {
  family: string;
  family_label: string;
  severity: number;
  magnitude: string;
  prob_predicted: number;
  flipped: boolean;
};

const W = 250;
const H = 190;
const PAD = { top: 18, right: 16, bottom: 34, left: 46 };

/**
 * The stability sweep, rebuilt natively so the traces can draw.
 *
 * x is severity, y is P(predicted class), and the dashed rule is the 0.50
 * decision boundary. A trace that crosses it is the model changing its answer
 * about an image whose finding did not change. Drawing them in sequence lets
 * the viewer watch it happen rather than read that it did.
 */
const Sweep: React.FC<{ rows: Row[]; clean: number; at: number }> = ({ rows, clean, at }) => {
  const frame = useCurrentFrame();

  const byFamily = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byFamily.has(r.family)) byFamily.set(r.family, []);
    byFamily.get(r.family)!.push(r);
  }
  const families = [...byFamily.entries()]
    .map(([k, v]) => ({ key: k, label: v[0].family_label, rows: [...v].sort((a, b) => a.severity - b.severity) }))
    .sort((a, b) => b.rows.filter((r) => r.flipped).length - a.rows.filter((r) => r.flipped).length);

  const sx = (sev: number) => PAD.left + (sev / 3) * (W - PAD.left - PAD.right);
  const sy = (p: number) => PAD.top + (1 - p) * (H - PAD.top - PAD.bottom);

  return (
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
      {families.slice(0, 4).map((fam, fi) => {
        const pts = [
          { sev: 0, p: clean, flipped: false },
          ...fam.rows.map((r) => ({ sev: r.severity, p: r.prob_predicted, flipped: r.flipped })),
        ];
        const d = pts.map((pt, i) => `${i ? "L" : "M"}${sx(pt.sev)},${sy(pt.p)}`).join(" ");
        const flips = fam.rows.filter((r) => r.flipped).length;
        const start = at + fi * 17;
        const draw = interpolate(frame, [start, start + 26], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        });

        return (
          <div key={fam.key} style={{ opacity: interpolate(frame, [start - 6, start + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 6,
                width: W,
              }}
            >
              <span style={{ fontFamily: F.display, fontSize: 21, fontWeight: 600, color: C.ink }}>
                {fam.label}
              </span>
              {flips > 0 ? (
                <span style={{ fontFamily: F.mono, fontSize: 19, fontWeight: 600, color: C.blockInk }}>
                  {flips}✕
                </span>
              ) : null}
            </div>

            <svg width={W} height={H} style={{ display: "block" }}>
              <rect
                x={PAD.left}
                y={PAD.top}
                width={W - PAD.left - PAD.right}
                height={H - PAD.top - PAD.bottom}
                fill={C.sheet}
                stroke={C.rule}
              />
              {/* below the boundary the answer has changed */}
              <rect
                x={PAD.left}
                y={sy(0.5)}
                width={W - PAD.left - PAD.right}
                height={sy(0) - sy(0.5)}
                fill={C.block}
                fillOpacity={0.11}
              />
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={sy(0.5)}
                y2={sy(0.5)}
                stroke={C.blockInk}
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              {[0, 0.5, 1].map((t) => (
                <text
                  key={t}
                  x={PAD.left - 8}
                  y={sy(t) + 5}
                  textAnchor="end"
                  fontFamily={F.mono}
                  fontSize={14}
                  fill={C.faint}
                >
                  {t.toFixed(1)}
                </text>
              ))}
              {[0, 1, 2, 3].map((s) => (
                <text
                  key={s}
                  x={sx(s)}
                  y={H - 10}
                  textAnchor="middle"
                  fontFamily={F.mono}
                  fontSize={14}
                  fill={C.faint}
                >
                  {s === 0 ? "clean" : s}
                </text>
              ))}

              <path
                d={d}
                fill="none"
                stroke={C.plot}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={draw}
              />

              {pts.map((pt, i) => {
                const reveal = interpolate(frame, [start + i * 6, start + i * 6 + 5], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                return (
                  <circle
                    key={i}
                    cx={sx(pt.sev)}
                    cy={sy(pt.p)}
                    r={(pt.flipped ? 6.5 : 4.5) * reveal}
                    fill={pt.flipped ? C.blockInk : C.plot}
                    stroke={C.sheet}
                    strokeWidth={2.5}
                    paintOrder="stroke"
                  />
                );
              })}
            </svg>
          </div>
        );
      })}
    </div>
  );
};

export const Fragile: React.FC = () => {
  const frame = useCurrentFrame();
  const { cue } = sceneOf("fragile");
  const f = data.fragile;
  const s = f.perturbation_summary;

  return (
    <Sheet slug="Confidence is not reliability">
      <AbsoluteFill style={{ padding: "150px 120px 120px" }}>
        <div style={{ display: "flex", gap: 60, alignItems: "flex-start" }}>
          <div style={{ opacity: interpolate(frame, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }) }}>
            <Plate src="confident-but-fragile.png" size={300} />
            <div style={{ marginTop: 22 }}>
              <FieldLabel>Classifier output</FieldLabel>
              <div
                style={{
                  marginTop: 10,
                  fontFamily: F.display,
                  fontSize: 50,
                  fontWeight: 700,
                  color: C.ink,
                  letterSpacing: "-0.02em",
                }}
              >
                {f.predicted_class}
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 34, color: C.graphite, marginTop: 6 }}>
                {(f.confidence * 100).toFixed(1)}% confident
              </div>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <Headline size={62} style={{ maxWidth: 1120 }}>
              Change the gamma. The model changes its answer.
            </Headline>
            <div
              style={{
                marginTop: 20,
                fontFamily: F.display,
                fontSize: 30,
                lineHeight: 1.45,
                color: C.graphite,
                maxWidth: 1020,
                opacity: interpolate(frame, [10, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
              }}
            >
              Twenty-one label-preserving perturbations. The dashed rule is the 0.50 decision
              boundary — a trace that crosses it is the model contradicting itself about an
              unchanged finding.
            </div>

            <div style={{ marginTop: 40 }}>
              <Sweep rows={f.perturbation_table as Row[]} clean={f.confidence} at={cue.fragilePayoff + 26} />
            </div>
          </div>
        </div>

        {/* the count lands last */}
        <div
          style={{
            position: "absolute",
            left: 120,
            bottom: 150,
            display: "flex",
            alignItems: "baseline",
            gap: 22,
            opacity: interpolate(frame, [cue.fragilePayoff + 170, cue.fragilePayoff + 190], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE }),
          }}
        >
          <span style={{ fontFamily: F.mono, fontSize: 96, lineHeight: 1, color: C.blockInk, letterSpacing: "-0.03em" }}>
            {s.n_flips} of {s.n_variants}
          </span>
          <span style={{ fontFamily: F.display, fontSize: 34, color: C.graphite }}>
            perturbations flipped the label
          </span>
        </div>
      </AbsoluteFill>
    </Sheet>
  );
};
