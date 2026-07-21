import { useState } from "react";
import { Tooltip } from "../ui";

/**
 * The argument for a composite score, as a scatter.
 *
 * A deployed system gets one number to decide whether to trust a prediction,
 * and two different things can go wrong. Each axis is one of them:
 *
 *   x — detecting that the input is not from the training distribution
 *       (AUROC, higher is better, 0.5 is chance)
 *   y — ranking genuinely hard cases inside the distribution
 *       (AURC, lower is better, so the axis is inverted and up = better)
 *
 * Every signal is plotted once and labelled directly. The shaded corner is
 * "acceptable in both regimes". The point of the chart is which signals are
 * *not* in it.
 */

const W = 560;
const H = 340;
const PAD = { top: 20, right: 22, bottom: 52, left: 62 };

export interface RegimeRow {
  signal: string;
  in_distribution_aurc: number;
  shift_detection_auroc: number;
  is_composite: boolean;
  good_in_both: boolean;
}

export function TwoRegime({
  rows,
  bestAurc,
  bestAuroc,
}: {
  rows: RegimeRow[];
  bestAurc: number;
  bestAuroc: number;
}) {
  const [hover, setHover] = useState<{ r: RegimeRow; x: number; y: number } | null>(null);

  const xs = rows.map((r) => r.shift_detection_auroc);
  const ys = rows.map((r) => r.in_distribution_aurc);
  const xMin = Math.min(0.45, Math.min(...xs) - 0.04);
  const xMax = Math.max(1.0, Math.max(...xs) + 0.02);
  const yMin = Math.max(0, Math.min(...ys) - 0.004);
  const yMax = Math.max(...ys) + 0.006;

  const sx = (v: number) => PAD.left + ((v - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right);
  // inverted: lower AURC is better, so better sits higher
  const sy = (v: number) => PAD.top + ((v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);

  const okX = sx(bestAuroc - 0.05);
  const okY = sy(bestAurc + 0.01);

  return (
    <figure className="relative max-w-[600px]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Scatter of five trust signals. Only the ScanProof composite lands in the corner that is acceptable for both in-distribution ranking and shift detection."
      >
        {/* the acceptable-in-both corner */}
        <rect
          x={okX}
          y={PAD.top}
          width={W - PAD.right - okX}
          height={okY - PAD.top}
          fill="var(--color-pass)"
          fillOpacity={0.09}
        />
        <text
          x={W - PAD.right - 8}
          y={PAD.top + 14}
          textAnchor="end"
          className="num"
          fontSize={9}
          fill="var(--color-pass)"
          fillOpacity={0.85}
        >
          acceptable in both
        </text>

        {/* chance line for the detection axis */}
        <line
          x1={sx(0.5)}
          x2={sx(0.5)}
          y1={PAD.top}
          y2={H - PAD.bottom}
          stroke="var(--color-bone)"
          strokeOpacity={0.22}
          strokeDasharray="4 4"
        />
        <text
          x={sx(0.5) + 5}
          y={H - PAD.bottom - 6}
          className="num"
          fontSize={8.5}
          fill="var(--color-faint)"
        >
          chance
        </text>

        {/* axes */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
          stroke="var(--color-rule)"
        />
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-rule)" />

        {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
          .filter((t) => t >= xMin && t <= xMax)
          .map((t) => (
            <text
              key={t}
              x={sx(t)}
              y={H - PAD.bottom + 15}
              textAnchor="middle"
              className="num"
              fontSize={9}
              fill="var(--color-faint)"
            >
              {t.toFixed(2)}
            </text>
          ))}
        {[yMin, (yMin + yMax) / 2, yMax].map((t, i) => (
          <text
            key={i}
            x={PAD.left - 8}
            y={sy(t) + 3}
            textAnchor="end"
            className="num"
            fontSize={9}
            fill="var(--color-faint)"
          >
            {t.toFixed(3)}
          </text>
        ))}

        <text
          x={(PAD.left + W - PAD.right) / 2}
          y={H - 8}
          textAnchor="middle"
          className="eyebrow"
          fontSize={8.5}
          fill="var(--color-faint)"
          letterSpacing="1.3"
        >
          SHIFT DETECTION AUROC →
        </text>
        <text
          x={14}
          y={(PAD.top + H - PAD.bottom) / 2}
          textAnchor="middle"
          className="eyebrow"
          fontSize={8.5}
          fill="var(--color-faint)"
          letterSpacing="1.3"
          transform={`rotate(-90 14 ${(PAD.top + H - PAD.bottom) / 2})`}
        >
          ← BETTER IN-DIST RANKING
        </text>

        {rows.map((r) => {
          const cx = sx(r.shift_detection_auroc);
          const cy = sy(r.in_distribution_aurc);
          const tone = r.is_composite ? "var(--color-pass)" : "var(--color-instrument)";
          const flip = cx > W - PAD.right - 130;
          return (
            <g key={r.signal}>
              <circle
                cx={cx}
                cy={cy}
                r={r.is_composite ? 7 : 5}
                fill={tone}
                stroke="var(--color-panel)"
                strokeWidth={2}
                paintOrder="stroke"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => {
                  const svg = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                  const box = (
                    e.currentTarget.closest("figure") as HTMLElement
                  ).getBoundingClientRect();
                  setHover({
                    r,
                    x: svg.left - box.left + (cx / W) * svg.width,
                    y: svg.top - box.top + (cy / H) * svg.height,
                  });
                }}
                onMouseLeave={() => setHover(null)}
              />
              <text
                x={flip ? cx - 11 : cx + 11}
                y={cy + 3.5}
                textAnchor={flip ? "end" : "start"}
                fontSize={9.5}
                className="num"
                fill={r.is_composite ? "var(--color-pass)" : "var(--color-mute)"}
                fontWeight={r.is_composite ? 600 : 400}
              >
                {r.signal}
              </text>
            </g>
          );
        })}
      </svg>

      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          <div className="font-display text-[0.72rem] font-medium text-bone">
            {hover.r.signal}
          </div>
          <div className="num mt-1.5 text-[0.7rem] text-mute">
            in-distribution AURC{" "}
            <span className="text-bone">{hover.r.in_distribution_aurc.toFixed(4)}</span>
          </div>
          <div className="num text-[0.7rem] text-mute">
            shift AUROC{" "}
            <span className="text-bone">{hover.r.shift_detection_auroc.toFixed(4)}</span>
          </div>
          <div
            className="mt-1.5 font-mono text-[0.62rem] uppercase tracking-[0.1em]"
            style={{ color: hover.r.good_in_both ? "var(--color-pass)" : "var(--color-block)" }}
          >
            {hover.r.good_in_both ? "acceptable in both" : "fails one regime"}
          </div>
        </Tooltip>
      )}
    </figure>
  );
}
