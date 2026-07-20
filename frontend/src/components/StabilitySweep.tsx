import { useMemo, useState } from "react";
import type { PerturbationRow, ReliabilityResult } from "../types";
import { Panel, Tooltip } from "./ui";

/**
 * The signature view.
 *
 * One panel per perturbation family. x is severity (0 = the untouched film),
 * y is P(predicted class). The dashed rule at 0.50 is the decision boundary:
 * when a trace crosses it, the model has changed its answer about an image
 * whose finding did not change. You watch the prediction fall over.
 *
 * A single measure on a single scale, so no dual axis and no colour ramp — the
 * traces are instrument blue, and colour is spent only on the crossings, which
 * is the one thing worth flagging.
 */

const W = 168;
const H = 96;
const PAD = { top: 12, right: 12, bottom: 20, left: 30 };

interface HoverState {
  x: number;
  y: number;
  row: PerturbationRow | null;
  clean: boolean;
  family: string;
}

export function StabilitySweep({ result }: { result: ReliabilityResult }) {
  const [hover, setHover] = useState<HoverState | null>(null);

  const families = useMemo(() => {
    const map = new Map<string, { label: string; rows: PerturbationRow[] }>();
    for (const row of result.perturbation_table) {
      if (!map.has(row.family)) map.set(row.family, { label: row.family_label, rows: [] });
      map.get(row.family)!.rows.push(row);
    }
    for (const v of map.values()) v.rows.sort((a, b) => a.severity - b.severity);
    // Most-disturbed family first: the evidence should lead.
    return [...map.entries()].sort((a, b) => {
      const flips = (e: [string, { rows: PerturbationRow[] }]) =>
        e[1].rows.filter((r) => r.flipped).length;
      const worst = (e: [string, { rows: PerturbationRow[] }]) =>
        Math.max(...e[1].rows.map((r) => Math.abs(r.delta)));
      return flips(b as never) - flips(a as never) || worst(b as never) - worst(a as never);
    });
  }, [result]);

  const clean = result.confidence;
  const sx = (sev: number) => PAD.left + (sev / 3) * (W - PAD.left - PAD.right);
  const sy = (p: number) => PAD.top + (1 - p) * (H - PAD.top - PAD.bottom);
  const s = result.perturbation_summary;

  return (
    <Panel
      eyebrow="Signature test · stability sweep"
      title={`P(${result.predicted_class}) under ${s.n_variants} label-preserving perturbations`}
      aside={
        <div className="num text-xs text-mute">
          <span style={{ color: s.n_flips ? "var(--color-block)" : "var(--color-pass)" }}>
            {s.n_flips}
          </span>
          <span className="text-faint"> / {s.n_variants} flipped</span>
          <span className="ml-3 text-faint">mean |Δ| {s.mean_abs_delta.toFixed(3)}</span>
        </div>
      }
    >
      <p className="mb-4 max-w-3xl text-xs leading-relaxed text-mute">
        Each trace starts at the untouched film and walks through three graded severities. The
        dashed rule is the 0.50 decision boundary. None of these changes alter the finding on the
        film, so a trace that crosses the rule marks a prediction the model should not be trusted to
        repeat.
      </p>

      <div className="relative grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {families.map(([key, fam], fi) => {
          const pts = [
            { sev: 0, p: clean, row: null as PerturbationRow | null },
            ...fam.rows.map((r) => ({ sev: r.severity, p: r.prob_predicted, row: r })),
          ];
          const d = pts.map((pt, i) => `${i ? "L" : "M"}${sx(pt.sev)},${sy(pt.p)}`).join(" ");
          const flips = fam.rows.filter((r) => r.flipped).length;
          const len = 260;

          return (
            <figure key={key} className="min-w-0">
              <figcaption className="flex items-baseline justify-between gap-1 px-1">
                <span className="truncate font-display text-[0.7rem] font-medium text-bone">
                  {fam.label}
                </span>
                {flips > 0 && (
                  <span
                    className="num shrink-0 text-[0.6rem] font-semibold"
                    style={{ color: "var(--color-block)" }}
                  >
                    {flips}✕
                  </span>
                )}
              </figcaption>

              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                role="img"
                aria-label={`${fam.label}: ${
                  flips ? `${flips} of 3 severities flipped the label` : "no severity flipped the label"
                }`}
              >
                {/* plot frame */}
                <rect
                  x={PAD.left}
                  y={PAD.top}
                  width={W - PAD.left - PAD.right}
                  height={H - PAD.top - PAD.bottom}
                  fill="var(--color-panel-2)"
                />
                {/* the region below the boundary is where the answer changes */}
                <rect
                  x={PAD.left}
                  y={sy(0.5)}
                  width={W - PAD.left - PAD.right}
                  height={sy(0) - sy(0.5)}
                  fill="color-mix(in oklab, var(--color-block) 9%, transparent)"
                />
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={sy(0.5)}
                  y2={sy(0.5)}
                  stroke="var(--color-block)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.75}
                />
                {[0, 0.5, 1].map((t) => (
                  <text
                    key={t}
                    x={PAD.left - 5}
                    y={sy(t) + 3}
                    textAnchor="end"
                    className="num"
                    fontSize={7}
                    fill="var(--color-faint)"
                  >
                    {t.toFixed(1)}
                  </text>
                ))}
                {[0, 1, 2, 3].map((sev) => (
                  <text
                    key={sev}
                    x={sx(sev)}
                    y={H - 6}
                    textAnchor="middle"
                    className="num"
                    fontSize={7}
                    fill="var(--color-faint)"
                  >
                    {sev === 0 ? "clean" : sev}
                  </text>
                ))}

                <path
                  d={d}
                  fill="none"
                  stroke="var(--color-instrument)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    strokeDasharray: len,
                    strokeDashoffset: len,
                    animation: `trace 0.7s ${0.05 * fi + 0.15}s cubic-bezier(0.3,0.7,0.3,1) forwards`,
                  }}
                />

                {pts.map((pt, i) => (
                  <g key={i}>
                    {/* generous invisible hit target */}
                    <circle
                      cx={sx(pt.sev)}
                      cy={sy(pt.p)}
                      r={11}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => {
                        const host = e.currentTarget.closest("div.relative") as HTMLElement;
                        const svg = e.currentTarget.closest("svg")!.getBoundingClientRect();
                        const box = host.getBoundingClientRect();
                        setHover({
                          x: svg.left - box.left + (sx(pt.sev) / W) * svg.width,
                          y: svg.top - box.top + (sy(pt.p) / H) * svg.height,
                          row: pt.row,
                          clean: pt.sev === 0,
                          family: fam.label,
                        });
                      }}
                      onMouseLeave={() => setHover(null)}
                    />
                    <circle
                      cx={sx(pt.sev)}
                      cy={sy(pt.p)}
                      r={pt.row?.flipped ? 3.6 : 2.6}
                      fill={pt.row?.flipped ? "var(--color-block)" : "var(--color-instrument)"}
                      stroke="var(--color-panel-2)"
                      strokeWidth={2}
                      paintOrder="stroke"
                    />
                  </g>
                ))}
              </svg>
            </figure>
          );
        })}

        {hover && (
          <Tooltip x={hover.x} y={hover.y}>
            <div className="font-display text-[0.7rem] font-medium text-bone">
              {hover.clean ? "Untouched film" : `${hover.family} ${hover.row?.magnitude}`}
            </div>
            <div className="num mt-1.5 text-[0.7rem] text-mute">
              P({result.predicted_class}){" "}
              <span className="text-bone">
                {(hover.clean ? clean : hover.row!.prob_predicted).toFixed(3)}
              </span>
            </div>
            {!hover.clean && (
              <>
                <div className="num text-[0.7rem] text-mute">
                  Δ{" "}
                  <span className="text-bone">
                    {hover.row!.delta > 0 ? "+" : ""}
                    {hover.row!.delta.toFixed(3)}
                  </span>
                </div>
                <div
                  className="mt-1.5 font-mono text-[0.62rem] uppercase tracking-[0.1em]"
                  style={{
                    color: hover.row!.flipped ? "var(--color-block)" : "var(--color-pass)",
                  }}
                >
                  {hover.row!.flipped ? `→ ${hover.row!.predicted_class}` : "label held"}
                </div>
              </>
            )}
          </Tooltip>
        )}
      </div>

      <details className="mt-4 border-t border-rule-soft pt-3">
        <summary className="eyebrow cursor-pointer select-none hover:text-mute">
          All {s.n_variants} measurements as a table
        </summary>
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-panel">
              <tr className="eyebrow border-b border-rule-soft">
                <th className="py-2 pr-3 font-normal">Test</th>
                <th className="py-2 pr-3 font-normal">Magnitude</th>
                <th className="py-2 pr-3 text-right font-normal">P(pred)</th>
                <th className="py-2 pr-3 text-right font-normal">Δ</th>
                <th className="py-2 font-normal">Label</th>
              </tr>
            </thead>
            <tbody>
              {result.perturbation_table.map((r, i) => (
                <tr key={i} className="border-b border-rule-soft/50">
                  <td className="py-1.5 pr-3 text-mute">{r.family_label}</td>
                  <td className="num py-1.5 pr-3 text-faint">{r.magnitude}</td>
                  <td className="num py-1.5 pr-3 text-right text-bone">
                    {r.prob_predicted.toFixed(3)}
                  </td>
                  <td className="num py-1.5 pr-3 text-right text-mute">
                    {r.delta > 0 ? "+" : ""}
                    {r.delta.toFixed(3)}
                  </td>
                  <td
                    className="num py-1.5 text-[0.7rem]"
                    style={{ color: r.flipped ? "var(--color-block)" : "var(--color-faint)" }}
                  >
                    {r.flipped ? `✕ ${r.predicted_class}` : "held"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Panel>
  );
}
