import type { ReactNode } from "react";
import type { Verdict } from "../types";

export const VERDICT_COLOR: Record<Verdict, string> = {
  PASS: "var(--color-pass)",
  REVIEW: "var(--color-review)",
  BLOCK: "var(--color-block)",
};

/** Status colour never travels alone — each verdict carries a glyph as well as
 *  its word, so the state survives colour-vision differences and greyscale. */
export const VERDICT_GLYPH: Record<Verdict, string> = {
  PASS: "✓",
  REVIEW: "!",
  BLOCK: "✕",
};

/** Precise, non-clinical readings of each verdict. PASS is the absence of a
 *  reason to withhold, not evidence that the prediction is right. */
export const VERDICT_MEANING: Record<Verdict, string> = {
  PASS: "No check found a reason to withhold this prediction",
  REVIEW: "A check failed — route this to a human before relying on it",
  BLOCK: "Checks failed badly enough that this output should not be used",
};

export function Panel({
  eyebrow,
  title,
  aside,
  children,
  className = "",
}: {
  eyebrow?: string;
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`border border-rule-soft bg-panel ${className}`}
      style={{ borderRadius: 3 }}
    >
      {(eyebrow || title || aside) && (
        <header className="flex items-baseline justify-between gap-4 border-b border-rule-soft px-5 py-3.5">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && (
              <h2 className="mt-1.5 font-display text-[0.95rem] font-medium tracking-tight text-bone">
                {title}
              </h2>
            )}
          </div>
          {aside && <div className="shrink-0 text-right">{aside}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function VerdictChip({
  verdict,
  size = "sm",
}: {
  verdict: Verdict;
  size?: "sm" | "lg" | "hero";
}) {
  const c = VERDICT_COLOR[verdict];
  const pad =
    size === "hero" ? "px-4 py-2 text-2xl" : size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-[0.65rem]";
  return (
    <span
      className={`inline-flex items-center gap-2.5 font-mono font-semibold uppercase tracking-[0.14em] ${pad}`}
      style={{
        color: c,
        background: `color-mix(in oklab, ${c} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 45%, transparent)`,
        borderRadius: 2,
      }}
    >
      <span aria-hidden="true">{VERDICT_GLYPH[verdict]}</span>
      {verdict}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`pulse-soft bg-rule ${className}`} style={{ borderRadius: 2 }} />;
}

export function ErrorState({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="border px-5 py-4"
      style={{
        borderColor: "color-mix(in oklab, var(--color-block) 40%, transparent)",
        background: "color-mix(in oklab, var(--color-block) 8%, transparent)",
        borderRadius: 3,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm" style={{ color: "var(--color-block)" }} aria-hidden>
          ✕
        </span>
        <h3 className="font-display text-sm font-medium text-bone">{title}</h3>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-mute">{detail}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 cursor-pointer border border-rule px-3 py-1.5 font-mono text-xs uppercase tracking-[0.12em] text-bone transition-colors hover:bg-panel-2"
          style={{ borderRadius: 2 }}
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border border-dashed border-rule px-5 py-10 text-center" style={{ borderRadius: 3 }}>
      <h3 className="font-display text-sm font-medium text-bone">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-mute">{detail}</p>
    </div>
  );
}

/** A labelled measurement. The number is always mono and tabular. */
export function Readout({
  label,
  value,
  unit,
  color,
  sub,
  size = "md",
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  sub?: string;
  size?: "md" | "xl";
}) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div
        className={`num mt-2 leading-none ${size === "xl" ? "text-[2.75rem]" : "text-2xl"}`}
        style={{ color: color ?? "var(--color-bone)" }}
      >
        {value}
        {unit && <span className="ml-1 text-[0.5em] text-faint">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-xs leading-snug text-mute">{sub}</div>}
    </div>
  );
}

export function Tooltip({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: ReactNode;
}) {
  return (
    <div
      className="pointer-events-none absolute z-30 border border-rule bg-ink px-2.5 py-2 text-xs shadow-lg"
      style={{ left: x, top: y, transform: "translate(-50%, -115%)", borderRadius: 3, minWidth: 120 }}
      role="tooltip"
    >
      {children}
    </div>
  );
}
