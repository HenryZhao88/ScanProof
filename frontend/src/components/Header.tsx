import type { Health } from "../types";

export type View = "analyze" | "audit";

/**
 * The masthead of the report. Wordmark, what the document is, and the two
 * sections — set as a document header with a heavy rule under it, not as an
 * application toolbar.
 */
export function Header({
  view,
  onView,
  health,
}: {
  view: View;
  onView: (v: View) => void;
  health: Health | null;
}) {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-rule-hard bg-sheet">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-end justify-between gap-x-8 gap-y-3 px-6 pt-4 pb-3">
        <div className="flex items-baseline gap-4">
          <span className="font-display text-[1.35rem] font-bold tracking-[-0.035em] text-ink">
            ScanProof
          </span>
          <span className="hidden font-display text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-graphite sm:inline">
            Certificate of inspection
          </span>
          {health && (
            <span className="num hidden items-center gap-1.5 text-[0.6875rem] text-faint lg:flex">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: health.live_inference
                    ? "var(--color-pass-ink)"
                    : "var(--color-review-ink)",
                }}
              />
              {health.live_inference ? "live inference" : "cached results only"}
            </span>
          )}
        </div>

        <div className="flex items-center">
          <nav className="flex" aria-label="Report sections">
            {(
              [
                ["analyze", "Single case"],
                ["audit", "Aggregate audit"],
              ] as [View, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => onView(id)}
                aria-current={view === id ? "page" : undefined}
                className={`cursor-pointer border-b-2 px-3 pb-2 font-display text-[0.75rem] font-semibold tracking-[0.02em] transition-colors ${
                  view === id
                    ? "border-ink text-ink"
                    : "border-transparent text-faint hover:text-graphite"
                }`}
                style={{ marginBottom: -14 }}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Fixed to every screen, never dismissible. */}
      <div className="border-t border-rule bg-sheet-2">
        <p className="mx-auto max-w-[1600px] px-6 py-1.5 text-[0.6875rem] leading-relaxed text-graphite">
          <span className="font-semibold text-ink">Research prototype — not for diagnosis.</span>{" "}
          Not a medical device, no clinical validation, no regulatory claim. ScanProof tests
          whether a prediction should be relied on; PASS is not a claim that it is correct or
          clinically safe.
        </p>
      </div>
    </header>
  );
}
