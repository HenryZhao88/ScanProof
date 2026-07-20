import { useState } from "react";
import type { SelectivePoint } from "../../types";
import { Tooltip } from "../ui";

/**
 * Risk–coverage. Two rankings of the same 624 predictions, so there is one
 * measure on one axis — no dual scale.
 *
 * The confidence ranking is the control, not a peer series: it is drawn as a
 * dashed, low-chroma trace and both lines are labelled at their right end, so
 * identity never rests on hue alone.
 */

const W = 640;
const H = 260;
const PAD = { top: 16, right: 132, bottom: 34, left: 46 };

export function RiskCoverage({
  subject,
  control,
  subjectLabel,
  controlLabel,
}: {
  subject: SelectivePoint[];
  control: SelectivePoint[];
  subjectLabel: string;
  controlLabel: string;
}) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const all = [...subject, ...control];
  const lo = Math.min(...all.map((p) => p.accuracy));
  const yMin = Math.max(0, Math.floor(lo * 20 - 1) / 20);
  const yMax = 1;

  const sx = (cov: number) => PAD.left + cov * (W - PAD.left - PAD.right);
  const sy = (acc: number) =>
    PAD.top + (1 - (acc - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);

  const path = (pts: SelectivePoint[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${sx(p.coverage)},${sy(p.accuracy)}`).join(" ");

  const ticks = 5;
  const yTicks = Array.from({ length: ticks }, (_, i) => yMin + ((yMax - yMin) * i) / (ticks - 1));

  const last = (pts: SelectivePoint[]) => pts[pts.length - 1];

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Risk coverage curve. ${subjectLabel} versus ${controlLabel}.`}>
        {/* recessive grid */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={sy(t)}
              y2={sy(t)}
              stroke="var(--color-rule-soft)"
              strokeWidth={1}
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
        {[0.25, 0.5, 0.75, 1].map((cov) => (
          <text
            key={cov}
            x={sx(cov)}
            y={H - 12}
            textAnchor="middle"
            className="num"
            fontSize={9}
            fill="var(--color-faint)"
          >
            {(cov * 100).toFixed(0)}%
          </text>
        ))}
        <text
          x={(PAD.left + W - PAD.right) / 2}
          y={H - 1}
          textAnchor="middle"
          className="eyebrow"
          fontSize={8.5}
          fill="var(--color-faint)"
          letterSpacing="1.4"
        >
          COVERAGE — SHARE OF CASES RETAINED
        </text>

        {/* control first, so the subject sits on top */}
        <path
          d={path(control)}
          fill="none"
          stroke="var(--color-bone)"
          strokeOpacity={0.42}
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeLinecap="round"
        />
        <path
          d={path(subject)}
          fill="none"
          stroke="var(--color-instrument)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* direct labels at the right end — identity never rests on hue */}
        <g>
          <line
            x1={sx(1)}
            x2={W - PAD.right + 8}
            y1={sy(last(subject).accuracy)}
            y2={sy(last(subject).accuracy)}
            stroke="var(--color-instrument)"
            strokeWidth={1}
            opacity={0.5}
          />
          <text
            x={W - PAD.right + 12}
            y={sy(last(subject).accuracy) + 3}
            fontSize={9.5}
            fill="var(--color-instrument)"
            className="num"
          >
            reliability
          </text>
          <line
            x1={sx(1)}
            x2={W - PAD.right + 8}
            y1={sy(last(control).accuracy)}
            y2={sy(last(control).accuracy)}
            stroke="var(--color-bone)"
            strokeOpacity={0.35}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text
            x={W - PAD.right + 12}
            y={sy(last(control).accuracy) + 3 + (Math.abs(last(control).accuracy - last(subject).accuracy) < 0.008 ? 12 : 0)}
            fontSize={9.5}
            fill="var(--color-bone)"
            fillOpacity={0.55}
            className="num"
          >
            confidence
          </text>
        </g>

        {/* hover targets on the subject series */}
        {subject.map((p, i) => (
          <g key={i}>
            <rect
              x={sx(p.coverage) - (W - PAD.left - PAD.right) / (subject.length * 2)}
              y={PAD.top}
              width={(W - PAD.left - PAD.right) / subject.length}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              style={{ cursor: "crosshair" }}
              onMouseEnter={(e) => {
                const svg = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                const box = (e.currentTarget.closest("figure") as HTMLElement).getBoundingClientRect();
                setHover({
                  i,
                  x: svg.left - box.left + (sx(p.coverage) / W) * svg.width,
                  y: svg.top - box.top + (sy(p.accuracy) / H) * svg.height,
                });
              }}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}

        {hover !== null && (
          <>
            <line
              x1={sx(subject[hover.i].coverage)}
              x2={sx(subject[hover.i].coverage)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--color-bone)"
              strokeOpacity={0.25}
              strokeWidth={1}
            />
            <circle
              cx={sx(subject[hover.i].coverage)}
              cy={sy(subject[hover.i].accuracy)}
              r={4.5}
              fill="var(--color-instrument)"
              stroke="var(--color-panel)"
              strokeWidth={2}
            />
            <circle
              cx={sx(control[hover.i].coverage)}
              cy={sy(control[hover.i].accuracy)}
              r={4}
              fill="var(--color-bone)"
              fillOpacity={0.6}
              stroke="var(--color-panel)"
              strokeWidth={2}
            />
          </>
        )}
      </svg>

      {hover !== null && (
        <Tooltip x={hover.x} y={hover.y}>
          <div className="num text-[0.7rem] text-faint">
            coverage {(subject[hover.i].coverage * 100).toFixed(0)}% ·{" "}
            {subject[hover.i].n_retained} cases
          </div>
          <div className="num mt-1.5 text-[0.72rem]">
            <span style={{ color: "var(--color-instrument)" }}>reliability</span>{" "}
            <span className="text-bone">{(subject[hover.i].accuracy * 100).toFixed(1)}%</span>
          </div>
          <div className="num text-[0.72rem]">
            <span className="text-bone/55">confidence</span>{" "}
            <span className="text-bone">{(control[hover.i].accuracy * 100).toFixed(1)}%</span>
          </div>
        </Tooltip>
      )}

      <figcaption className="mt-2 text-[0.7rem] leading-relaxed text-faint">
        Accuracy over the retained cases as the lowest-ranked are withheld. A better ranking pushes
        the model's errors to the bottom, so its curve climbs faster as coverage falls.
      </figcaption>
    </figure>
  );
}
