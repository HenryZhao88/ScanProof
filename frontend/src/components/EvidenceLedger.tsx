import type { Evidence, EvidenceLevel } from "../types";
import { Panel } from "./ui";

const LEVEL: Record<EvidenceLevel, { color: string; glyph: string; word: string }> = {
  critical: { color: "var(--color-block)", glyph: "✕", word: "Critical" },
  warning: { color: "var(--color-review)", glyph: "!", word: "Caution" },
  ok: { color: "var(--color-pass)", glyph: "✓", word: "Clear" },
};

/**
 * Every line is a measurement the engine actually took, phrased with the number
 * that produced it. Nothing here is generated from the verdict after the fact —
 * the verdict is generated from these.
 */
export function EvidenceLedger({ evidence }: { evidence: Evidence[] }) {
  const counts = evidence.reduce<Record<string, number>>((acc, e) => {
    acc[e.level] = (acc[e.level] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Panel
      eyebrow="Evidence ledger"
      title="Why this case was scored the way it was"
      aside={
        <div className="num flex gap-2.5 text-[0.7rem]">
          {(["critical", "warning", "ok"] as EvidenceLevel[]).map(
            (l) =>
              counts[l] > 0 && (
                <span key={l} style={{ color: LEVEL[l].color }}>
                  {LEVEL[l].glyph} {counts[l]}
                </span>
              ),
          )}
        </div>
      }
    >
      <ol className="space-y-0">
        {evidence.map((e, i) => {
          const L = LEVEL[e.level];
          return (
            <li
              key={i}
              className="flex gap-3 border-b border-rule py-3 last:border-b-0 last:pb-0 first:pt-0"
            >
              <span
                className="num mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center text-[0.65rem] font-semibold"
                style={{
                  color: L.color,
                  background: `color-mix(in oklab, ${L.color} 15%, transparent)`,
                  borderRadius: 2,
                }}
                aria-hidden
              >
                {L.glyph}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h4 className="font-display text-[0.82rem] font-medium text-ink">{e.title}</h4>
                  <span className="field">
                    <span className="sr-only">{L.word} — </span>
                    {e.source}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-graphite">{e.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
