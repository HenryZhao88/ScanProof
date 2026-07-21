import { useState } from "react";
import type { Bin } from "../../types";
import { Tooltip } from "../ui";

/**
 * Reliability diagram. Bars are observed accuracy per confidence bin; the
 * diagonal is perfect calibration. A bar below the diagonal is overconfidence.
 * Empty bins are drawn as gaps rather than zeros — a bin with no cases has no
 * accuracy, and plotting it at 0 would invent a failure.
 */

const W = 420;
const H = 190;
const PAD = { top: 12, right: 10, bottom: 30, left: 36 };

export function ReliabilityDiagram({ bins }: { bins: Bin[] }) {
  const [hover, setHover] = useState<{ b: Bin; x: number; y: number } | null>(null);

  const sx = (v: number) => PAD.left + v * (W - PAD.left - PAD.right);
  const sy = (v: number) => PAD.top + (1 - v) * (H - PAD.top - PAD.bottom);
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  return (
    <figure className="relative max-w-[460px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label="Reliability diagram: observed accuracy against predicted confidence.">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={sy(t)}
              y2={sy(t)}
              stroke="var(--color-rule-soft)"
            />
            <text
              x={PAD.left - 6}
              y={sy(t) + 3}
              textAnchor="end"
              className="num"
              fontSize={8}
              fill="var(--color-faint)"
            >
              {t.toFixed(1)}
            </text>
          </g>
        ))}

        {/* perfect calibration */}
        <line
          x1={sx(0)}
          y1={sy(0)}
          x2={sx(1)}
          y2={sy(1)}
          stroke="var(--color-bone)"
          strokeOpacity={0.3}
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />

        {bins.map((b, i) => {
          if (!b.count || b.accuracy === null) return null;
          const x0 = sx(b.lower);
          const x1 = sx(b.upper);
          const w = Math.max(1, x1 - x0 - 2); // 2px surface gap between bars
          const y = sy(b.accuracy);
          // Opacity carries how much data backs the bin — a bar built on three
          // cases should not read as loudly as one built on three hundred.
          const weight = 0.35 + 0.65 * Math.sqrt(b.count / maxCount);
          return (
            <g key={i}>
              <rect
                x={x0 + 1}
                y={y}
                width={w}
                height={sy(0) - y}
                fill="var(--color-instrument)"
                fillOpacity={weight}
                rx={2}
                ry={2}
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => {
                  const svg = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                  const box = (e.currentTarget.closest("figure") as HTMLElement).getBoundingClientRect();
                  setHover({
                    b,
                    x: svg.left - box.left + (((x0 + x1) / 2) / W) * svg.width,
                    y: svg.top - box.top + (y / H) * svg.height,
                  });
                }}
                onMouseLeave={() => setHover(null)}
              />
              {b.confidence !== null && (
                <circle cx={sx(b.confidence)} cy={sy(b.accuracy)} r={2.5} fill="var(--color-bone)" />
              )}
            </g>
          );
        })}

        <text
          x={(PAD.left + W - PAD.right) / 2}
          y={H - 2}
          textAnchor="middle"
          className="eyebrow"
          fontSize={8}
          fill="var(--color-faint)"
          letterSpacing="1.3"
        >
          PREDICTED CONFIDENCE → OBSERVED ACCURACY
        </text>
      </svg>

      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          <div className="num text-[0.7rem] text-faint">
            bin {hover.b.lower.toFixed(2)}–{hover.b.upper.toFixed(2)} · {hover.b.count} cases
          </div>
          <div className="num mt-1 text-[0.72rem] text-bone">
            accuracy {(hover.b.accuracy! * 100).toFixed(1)}%
          </div>
          <div className="num text-[0.72rem] text-mute">
            mean confidence {(hover.b.confidence! * 100).toFixed(1)}%
          </div>
        </Tooltip>
      )}
    </figure>
  );
}
