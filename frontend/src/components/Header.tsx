import type { Health } from "../types";

export type View = "analyze" | "audit";

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
    <header className="sticky top-0 z-40 border-b border-rule-soft bg-ink/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-[1.05rem] font-bold tracking-[-0.02em] text-bone">
            ScanProof
          </span>
          <span className="eyebrow hidden sm:inline">Reliability bench</span>
        </div>

        <nav className="flex gap-1" aria-label="Views">
          {(
            [
              ["analyze", "Analyze"],
              ["audit", "Audit"],
            ] as [View, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => onView(id)}
              aria-current={view === id ? "page" : undefined}
              className={`cursor-pointer px-3 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.14em] transition-colors ${
                view === id ? "bg-panel-2 text-bone" : "text-faint hover:text-mute"
              }`}
              style={{ borderRadius: 2 }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {health && (
            <span className="num flex items-center gap-1.5 text-[0.65rem] text-faint">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: health.live_inference
                    ? "var(--color-pass)"
                    : "var(--color-review)",
                }}
              />
              {health.live_inference ? "live inference" : "cached only"}
            </span>
          )}
        </div>
      </div>

      {/* Persistent, on every screen. Not dismissible. */}
      <div
        className="border-t px-5 py-1.5"
        style={{
          borderColor: "color-mix(in oklab, var(--color-review) 25%, transparent)",
          background: "color-mix(in oklab, var(--color-review) 9%, transparent)",
        }}
      >
        <p className="mx-auto max-w-[1560px] font-mono text-[0.66rem] leading-relaxed tracking-wide text-review">
          Research prototype — not for diagnosis. ScanProof measures whether a model's prediction is
          stable under controlled tests. PASS does not mean clinically safe or diagnostically
          correct.
        </p>
      </div>
    </header>
  );
}
