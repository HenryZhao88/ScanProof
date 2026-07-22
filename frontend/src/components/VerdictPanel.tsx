import type { ReliabilityResult, SubScore } from "../types";
import { VERDICT_INK, VERDICT_MEANING, VerdictStamp } from "./ui";

/**
 * The disposition block of the certificate.
 *
 * Reading order is deliberate: what was submitted (the classifier's claim),
 * then the stamp, then the four checks that produced it. The 0-100 score is a
 * ranking convenience and is set as one line of small print — making it the
 * hero would argue that ScanProof is a better confidence score, which it is
 * not. It is four independent tests.
 */

type Status = "ok" | "warn" | "fail";

const STATUS_INK: Record<Status, string> = {
  ok: "var(--color-pass-ink)",
  warn: "var(--color-review-ink)",
  fail: "var(--color-block-ink)",
};
const STATUS_FILL: Record<Status, string> = {
  ok: "var(--color-pass)",
  warn: "var(--color-review)",
  fail: "var(--color-block)",
};
const STATUS_GLYPH: Record<Status, string> = { ok: "✓", warn: "!", fail: "✕" };
const STATUS_WORD: Record<Status, string> = { ok: "clear", warn: "caution", fail: "failed" };
const STATUS_RANK: Record<Status, number> = { fail: 0, warn: 1, ok: 2 };

function statusOf(value: number): Status {
  return value >= 0.85 ? "ok" : value >= 0.55 ? "warn" : "fail";
}

const ASKS: Record<string, string> = {
  typicality: "Has the model seen inputs like this?",
  stability: "Does the answer survive harmless changes?",
  agreement: "Do independently trained models concur?",
  confidence: "How far from the decision boundary?",
};

/** The measurement behind each check, compressed to one scannable line. */
function measurementOf(key: string, r: ReliabilityResult): string {
  const p = r.perturbation_summary;
  switch (key) {
    case "typicality":
      return `${(r.ood.percentile * 100).toFixed(1)}th percentile of training distribution`;
    case "stability":
      return `${p.n_flips} of ${p.n_variants} perturbations changed the label`;
    case "agreement":
      return `${r.ensemble.unanimous ? "all 3 agree" : "split vote"} · σ ${r.ensemble.std.toFixed(3)}`;
    case "confidence":
      return `${(r.confidence * 100).toFixed(1)}% calibrated for ${r.predicted_class}`;
    default:
      return "";
  }
}

export function VerdictPanel({ result }: { result: ReliabilityResult }) {
  const checks = result.subscores
    .map((s) => ({ sub: s, status: statusOf(s.value) }))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  const nClear = checks.filter((x) => x.status === "ok").length;

  return (
    <div className="border border-rule bg-sheet">
      {/* --- disposition ------------------------------------------------- */}
      <div className="grid grid-cols-1 items-center gap-6 border-b-2 border-rule-hard px-6 py-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="field">Submitted for inspection · classifier output</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-display text-[2.1rem] font-bold leading-none tracking-[-0.03em] text-ink">
              {result.predicted_class}
            </span>
            <span className="num text-[1.35rem] leading-none text-graphite">
              {(result.confidence * 100).toFixed(1)}
              <span className="text-[0.62em] text-faint">% confidence</span>
            </span>
          </div>
          <p className="mt-3 max-w-md text-[0.75rem] leading-relaxed text-graphite">
            Temperature-scaled on a held-out split. Confidence measures distance from the decision
            boundary — nothing else.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          <VerdictStamp verdict={result.verdict} />
          <p
            className="max-w-[15rem] text-[0.75rem] leading-snug lg:text-right"
            style={{ color: VERDICT_INK[result.verdict] }}
          >
            {VERDICT_MEANING[result.verdict]}.
          </p>
        </div>
      </div>

      {/* --- the four checks --------------------------------------------- */}
      <div className="px-6 pt-4 pb-1">
        <div className="flex items-baseline justify-between gap-4 pb-1">
          <div className="field">Inspection battery · four independent checks</div>
          <div className="num text-[0.6875rem] text-faint">
            <span style={{ color: nClear === 4 ? "var(--color-pass-ink)" : "var(--color-review-ink)" }}>
              {nClear}
            </span>
            /4 clear
            <span className="mx-2 text-rule">|</span>
            index {result.reliability_score.toFixed(1)}
          </div>
        </div>

        <ol>
          {checks.map(({ sub, status }, i) => (
            <Check key={sub.key} n={i + 1} sub={sub} status={status} result={result} />
          ))}
        </ol>
      </div>

      {result.gates.length > 0 && (
        <div className="border-t border-rule bg-sheet-2 px-6 py-4">
          <div className="field mb-2">Hard gates applied</div>
          <ul className="space-y-1.5">
            {result.gates.map((g, i) => (
              <li
                key={i}
                className="text-[0.78rem] leading-relaxed"
                style={{ color: VERDICT_INK[result.verdict] }}
              >
                {g}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[0.72rem] leading-relaxed text-faint">
            A gate overrides the weighted index outright. Some failures should not be averaged away
            by good numbers elsewhere.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * One line of the inspection battery, set as a form row: sequence number,
 * name, the measurement, disposition, and a tolerance bar. Rows are ordered
 * worst-first so the eye lands on the failure.
 */
function Check({
  n,
  sub,
  status,
  result,
}: {
  n: number;
  sub: SubScore;
  status: Status;
  result: ReliabilityResult;
}) {
  const ink = STATUS_INK[status];
  const pct = (sub.points / sub.max_points) * 100;

  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-rule py-3 last:border-b-0">
      <span className="seq self-start pt-[3px]">{String(n).padStart(2, "0")}</span>

      <div className="min-w-0">
        {/* The measurement sits beside the name, not under it: it is the point
            of the row, and adjacency keeps the line from stranding. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="font-display text-[0.875rem] font-semibold text-ink">{sub.label}</span>
          <span className="num text-[0.78rem]" style={{ color: ink }}>
            {measurementOf(sub.key, result)}
          </span>
        </div>
        <div className="mt-0.5 text-[0.7rem] text-faint">{ASKS[sub.key]}</div>
      </div>

      <div className="flex items-center gap-4 justify-self-end">
        <div className="hidden h-[8px] w-40 border border-rule bg-sheet-2 md:block" aria-hidden>
          <div className="h-full" style={{ width: `${pct}%`, background: STATUS_FILL[status] }} />
        </div>
        <span className="num w-[3.5rem] shrink-0 text-right text-[0.7rem] text-faint">
          {sub.points.toFixed(1)}/{sub.max_points.toFixed(0)}
        </span>
        <span
          className="num w-[4.25rem] shrink-0 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.06em]"
          style={{ color: ink }}
        >
          <span aria-hidden="true" className="mr-1">
            {STATUS_GLYPH[status]}
          </span>
          {STATUS_WORD[status]}
        </span>
      </div>
    </li>
  );
}
