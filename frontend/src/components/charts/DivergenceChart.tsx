import { useState } from "react";
import { Tooltip } from "../ui";

/**
 * The deployment test, in one image.
 *
 * Four populations ordered by distance from the data the model was fine-tuned
 * on. Two quantities, both percentages, so they share a single axis — the
 * model's own confidence, and the share of cases ScanProof is willing to pass.
 *
 * Confidence runs flat across the whole range: a two-class softmax is
 * normalised over the two classes it knows, so it has no way to express "this
 * is not my kind of input". The PASS rate falls off a cliff. The gap between
 * the two lines is the thing this project exists to measure.
 */

const W = 720;
const H = 312;
const PAD = { top: 22, right: 150, bottom: 74, left: 56 };

export interface ArmPoint {
  label: string;
  /** newline-separated, rendered as stacked lines under the tick */
  short: string;
  emphasis?: boolean;
  confidence: number;
  passRate: number;
  accuracy: number | null;
  n: number;
}

export function DivergenceChart({ arms }: { arms: ArmPoint[] }) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const sx = (i: number) =>
    PAD.left + (i / Math.max(1, arms.length - 1)) * (W - PAD.left - PAD.right);
  const sy = (v: number) => PAD.top + (1 - v) * (H - PAD.top - PAD.bottom);

  const line = (get: (a: ArmPoint) => number) =>
    arms.map((a, i) => `${i ? "L" : "M"}${sx(i)},${sy(get(a))}`).join(" ");

  const last = arms.length - 1;

  return (
    <figure className="relative max-w-[760px]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Model confidence stays flat across four populations while the ScanProof pass rate collapses."
      >
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
              x={PAD.left - 7}
              y={sy(t) + 3}
              textAnchor="end"
              className="num"
              fontSize={9}
              fill="var(--color-faint)"
            >
              {(t * 100).toFixed(0)}%
            </text>
          </g>
        ))}

        {/* the region between the two traces is the story */}
        <path
          d={`${line((a) => a.confidence)} ${arms
            .map((_, i) => {
              const j = arms.length - 1 - i;
              return `L${sx(j)},${sy(arms[j].passRate)}`;
            })
            .join(" ")} Z`}
          fill="var(--color-block)"
          fillOpacity={0.07}
        />

        {arms.map((a, i) => (
          <g key={a.short}>
            <line
              x1={sx(i)}
              x2={sx(i)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--color-rule-soft)"
              strokeDasharray="2 4"
            />
            {a.short.split("\n").map((lineText, li) => (
              <text
                key={li}
                x={sx(i)}
                y={H - PAD.bottom + 17 + li * 11}
                textAnchor="middle"
                className="num"
                fontSize={9}
                fill={li === 0 ? "var(--color-mute)" : "var(--color-faint)"}
                fontWeight={a.emphasis && li === 0 ? 600 : 400}
              >
                {lineText}
              </text>
            ))}
            <text
              x={sx(i)}
              y={H - PAD.bottom + 17 + a.short.split("\n").length * 11}
              textAnchor="middle"
              className="num"
              fontSize={8}
              fill="var(--color-faint)"
            >
              n={a.n}
            </text>
          </g>
        ))}

        <text
          x={(PAD.left + W - PAD.right) / 2}
          y={H - 6}
          textAnchor="middle"
          className="eyebrow"
          fontSize={8.5}
          fill="var(--color-faint)"
          letterSpacing="1.4"
        >
          ← TRAINED ON THIS · · · · · · · NEVER SEEN THIS →
        </text>

        <path
          d={line((a) => a.confidence)}
          fill="none"
          stroke="var(--color-block)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={line((a) => a.passRate)}
          fill="none"
          stroke="var(--color-pass)"
          strokeWidth={2}
          strokeDasharray="6 4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {arms.map((a, i) => (
          <g key={`m${a.short}`}>
            <circle
              cx={sx(i)}
              cy={sy(a.confidence)}
              r={4.5}
              fill="var(--color-block)"
              stroke="var(--color-panel)"
              strokeWidth={2}
              paintOrder="stroke"
            />
            <circle
              cx={sx(i)}
              cy={sy(a.passRate)}
              r={4.5}
              fill="var(--color-pass)"
              stroke="var(--color-panel)"
              strokeWidth={2}
              paintOrder="stroke"
            />
            <rect
              x={sx(i) - 26}
              y={PAD.top}
              width={52}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              style={{ cursor: "crosshair" }}
              onMouseEnter={(e) => {
                const svg = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                const box = (e.currentTarget.closest("figure") as HTMLElement).getBoundingClientRect();
                setHover({
                  i,
                  x: svg.left - box.left + (sx(i) / W) * svg.width,
                  y: svg.top - box.top + (sy(Math.max(a.confidence, a.passRate)) / H) * svg.height,
                });
              }}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}

        {/* direct labels — identity never rests on colour alone */}
        <text
          x={W - PAD.right + 12}
          y={sy(arms[last].confidence) + 3}
          fontSize={10}
          className="num"
          fill="var(--color-block)"
        >
          model confidence
        </text>
        <text
          x={W - PAD.right + 12}
          y={sy(arms[last].passRate) + 3}
          fontSize={10}
          className="num"
          fill="var(--color-pass)"
        >
          ScanProof PASS rate
        </text>
      </svg>

      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          <div className="font-display text-[0.72rem] font-medium text-bone">
            {arms[hover.i].label}
          </div>
          <div className="num mt-1.5 text-[0.7rem]">
            <span style={{ color: "var(--color-block)" }}>confidence</span>{" "}
            <span className="text-bone">{(arms[hover.i].confidence * 100).toFixed(1)}%</span>
          </div>
          <div className="num text-[0.7rem]">
            <span style={{ color: "var(--color-pass)" }}>PASS rate</span>{" "}
            <span className="text-bone">{(arms[hover.i].passRate * 100).toFixed(1)}%</span>
          </div>
          {arms[hover.i].accuracy !== null && (
            <div className="num text-[0.7rem] text-mute">
              accuracy {(arms[hover.i].accuracy! * 100).toFixed(1)}%
            </div>
          )}
        </Tooltip>
      )}
    </figure>
  );
}
