import type { ReactNode } from "react";
import type { Verdict } from "../types";

/** Fills. Always paired with the verdict word — never colour alone. */
export const VERDICT_COLOR: Record<Verdict, string> = {
  PASS: "var(--color-pass)",
  REVIEW: "var(--color-review)",
  BLOCK: "var(--color-block)",
};

/** Text and strokes. Darker tier, all above 5.3:1 on the page. */
export const VERDICT_INK: Record<Verdict, string> = {
  PASS: "var(--color-pass-ink)",
  REVIEW: "var(--color-review-ink)",
  BLOCK: "var(--color-block-ink)",
};

export const VERDICT_GLYPH: Record<Verdict, string> = {
  PASS: "✓",
  REVIEW: "!",
  BLOCK: "✕",
};

/** Precise, non-clinical readings. PASS is the absence of a reason to withhold,
 *  not evidence that the prediction is right. */
export const VERDICT_MEANING: Record<Verdict, string> = {
  PASS: "No check found a reason to withhold this prediction",
  REVIEW: "A check failed — route this to a human before relying on it",
  BLOCK: "Checks failed badly enough that this output should not be used",
};

const VERDICT_CAPTION: Record<Verdict, string> = {
  PASS: "released",
  REVIEW: "hold for review",
  BLOCK: "withheld",
};

/**
 * A sheet in the report. Square corners, hairline rule, a heavy rule under the
 * heading — the structure of a printed form rather than a floating card.
 */
export function Panel({
  eyebrow,
  title,
  aside,
  seq,
  children,
  className = "",
}: {
  eyebrow?: string;
  title?: string;
  aside?: ReactNode;
  seq?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-rule bg-sheet ${className}`}>
      {(eyebrow || title || aside) && (
        <header className="flex items-start justify-between gap-4 border-b-2 border-rule-hard px-6 py-4">
          <div className="flex min-w-0 gap-3">
            {seq && <span className="seq mt-[3px] shrink-0">{seq}</span>}
            <div className="min-w-0">
              {eyebrow && <div className="field">{eyebrow}</div>}
              {title && (
                <h2 className="mt-1.5 font-display text-[1.0625rem] font-semibold leading-tight tracking-[-0.011em] text-ink">
                  {title}
                </h2>
              )}
            </div>
          </div>
          {aside && <div className="shrink-0 pt-0.5 text-right">{aside}</div>}
        </header>
      )}
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

/**
 * The verdict, stamped. This is the one place the design raises its voice, and
 * it earns it: on a certificate the disposition is a stamp, and the stamp is
 * what a reader looks for first.
 */
export function VerdictStamp({ verdict, animate = true }: { verdict: Verdict; animate?: boolean }) {
  return (
    <div
      className={`stamp ${animate ? "stamp-in" : ""}`}
      style={{ color: VERDICT_INK[verdict] }}
      role="status"
      aria-label={`Verdict: ${verdict}. ${VERDICT_MEANING[verdict]}.`}
    >
      <span className="stamp__word">
        <span aria-hidden="true" className="mr-2 text-[0.7em] align-[0.08em]">
          {VERDICT_GLYPH[verdict]}
        </span>
        {verdict}
      </span>
      <span className="stamp__caption">{VERDICT_CAPTION[verdict]}</span>
    </div>
  );
}

/** Inline verdict tag for lists and tables. */
export function VerdictTag({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className="num inline-flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em]"
      style={{ color: VERDICT_INK[verdict] }}
    >
      <span aria-hidden="true">{VERDICT_GLYPH[verdict]}</span>
      {verdict}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`pulse-soft bg-rule ${className}`} />;
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
      className="border-l-4 border border-rule bg-sheet px-5 py-4"
      style={{ borderLeftColor: "var(--color-block-ink)" }}
    >
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-graphite">{detail}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 cursor-pointer border border-rule-hard px-3 py-1.5 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-ink hover:text-sheet"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border border-dashed border-rule bg-sheet px-5 py-12 text-center">
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-[0.8125rem] leading-relaxed text-graphite">
        {detail}
      </p>
    </div>
  );
}

/** A labelled measurement in the report. Label sits tight above its value. */
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
      <div className="field">{label}</div>
      <div
        className={`num mt-1.5 leading-none tracking-[-0.02em] ${
          size === "xl" ? "text-[2.5rem]" : "text-[1.6rem]"
        }`}
        style={{ color: color ?? "var(--color-ink)" }}
      >
        {value}
        {unit && <span className="ml-0.5 text-[0.5em] text-faint">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-[0.75rem] leading-relaxed text-graphite">{sub}</div>}
    </div>
  );
}

export function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-30 border border-rule-hard bg-sheet px-2.5 py-2 text-xs shadow-[3px_3px_0_0_rgba(16,22,28,0.12)]"
      style={{ left: x, top: y, transform: "translate(-50%, -115%)", minWidth: 130 }}
      role="tooltip"
    >
      {children}
    </div>
  );
}
