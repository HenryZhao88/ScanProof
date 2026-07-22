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

import type { RegimeRowData as RegimeRow } from "../../types";

export function TwoRegime({ rows }: { rows: RegimeRow[] }) {
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

  // The region that would strictly beat the composite on both axes. Shading it
  // and showing it empty is the honest version of the argument: no signal
  // dominates the composite, even though none clears both absolute bars.
  const comp = rows.find((r) => r.is_composite) ?? rows[0];
  const domX = sx(comp.shift_detection_auroc);
  const domY = sy(comp.in_distribution_aurc);

  return (
    <figure className="relative max-w-[600px]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Scatter of five trust signals. Only the ScanProof composite lands in the corner that is acceptable for both in-distribution ranking and shift detection."
      >
        {/* region that would beat the composite on both axes — deliberately empty */}
        <rect
          x={domX}
          y={PAD.top}
          width={Math.max(0, W - PAD.right - domX)}
          height={Math.max(0, domY - PAD.top)}
          fill="var(--color-pass)"
          fillOpacity={0.07}
          stroke="var(--color-pass)"
          strokeOpacity={0.3}
          strokeDasharray="3 3"
        />
        <text
          x={W - PAD.right - 7}
          y={PAD.top + (domY - PAD.top) / 2 + 3}
          textAnchor="end"
          className="num"
          fontSize={9}
          fill="var(--color-pass)"
          fillOpacity={0.9}
        >
          no signal here
        </text>

        {/* chance line for the detection axis */}
        <line
          x1={sx(0.5)}
          x2={sx(0.5)}
          y1={PAD.top}
          y2={H - PAD.bottom}
          stroke="var(--color-ink)"
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
          className="field"
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
          className="field"
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
          const tone = r.is_composite ? "var(--color-pass)" : "var(--color-plot)";
          const flip = cx > W - PAD.right - 130;
          return (
            <g key={r.signal}>
              <circle
                cx={cx}
                cy={cy}
                r={r.is_composite ? 7 : 5}
                fill={tone}
                stroke="var(--color-sheet)"
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
                fill={r.is_composite ? "var(--color-pass)" : "var(--color-graphite)"}
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
          <div className="font-display text-[0.72rem] font-medium text-ink">
            {hover.r.signal}
          </div>
          <div className="num mt-1.5 text-[0.7rem] text-graphite">
            in-distribution AURC{" "}
            <span className="text-ink">{hover.r.in_distribution_aurc.toFixed(4)}</span>
          </div>
          <div className="num text-[0.7rem] text-graphite">
            shift AUROC{" "}
            <span className="text-ink">{hover.r.shift_detection_auroc.toFixed(4)}</span>
          </div>
          <div
            className="mt-1.5 font-mono text-[0.62rem] uppercase tracking-[0.1em]"
            style={{ color: hover.r.pareto_optimal ? "var(--color-pass)" : "var(--color-block)" }}
          >
            worst-case {hover.r.worst_case.toFixed(3)} ·{" "}
            {hover.r.pareto_optimal ? "on the frontier" : `beaten by ${hover.r.dominated_by[0]}`}
          </div>
        </Tooltip>
      )}
      <figcaption className="mt-2 text-[0.7rem] leading-relaxed text-faint">
        Up is a better in-distribution error ranker; right is a better shift detector. The dashed
        box is everything that would beat the composite on <em>both</em> axes at once — it is
        empty. Confidence and the embedding distance each win one axis and lose the other.
      </figcaption>
    </figure>
  );
}
