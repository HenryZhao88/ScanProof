import type { ReliabilityResult, SubScore } from "../types";
import { VERDICT_COLOR, VERDICT_GLYPH, VERDICT_MEANING, VerdictChip } from "./ui";

/**
 * The split readout. What the classifier reports sits beside what the guardrail
 * decided, because the whole claim is that these are different questions.
 *
 * The hero on the right is the **decision** and the **four checks**, not the
 * 0-100 number. The number is a weighted convenience for ranking; the thing a
 * reviewer acts on is which check failed and why. Earlier revisions made the
 * score the largest element on screen, which argued — wrongly — that ScanProof
 * is a better confidence score. It is not. It is four independent tests.
 */

type Status = "ok" | "warn" | "fail";

const STATUS_TONE: Record<Status, string> = {
  ok: "var(--color-pass)",
  warn: "var(--color-review)",
  fail: "var(--color-block)",
};
const STATUS_GLYPH: Record<Status, string> = { ok: "✓", warn: "!", fail: "✕" };
const STATUS_RANK: Record<Status, number> = { fail: 0, warn: 1, ok: 2 };

function statusOf(value: number): Status {
  return value >= 0.85 ? "ok" : value >= 0.55 ? "warn" : "fail";
}

/** What each check actually asks, in one clause. */
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
      return `${(r.ood.percentile * 100).toFixed(1)}th percentile of the training distribution`;
    case "stability":
      return `${p.n_flips} of ${p.n_variants} perturbations changed the label`;
    case "agreement": {
      const e = r.ensemble;
      return `${e.unanimous ? "all 3" : "split vote"} · σ ${e.std.toFixed(3)} across checkpoints`;
    }
    case "confidence":
      return `${(r.confidence * 100).toFixed(1)}% calibrated for ${r.predicted_class}`;
    default:
      return "";
  }
}

export function VerdictPanel({ result }: { result: ReliabilityResult }) {
  const c = VERDICT_COLOR[result.verdict];

  const checks = result.subscores
    .map((s) => ({ sub: s, status: statusOf(s.value) }))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  const nPassed = checks.filter((x) => x.status === "ok").length;

  return (
    <div className="border border-rule-soft bg-panel" style={{ borderRadius: 3 }}>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {/* --- what the classifier reports --- */}
        <div className="border-b border-rule-soft p-5 sm:border-r sm:border-b-0">
          <div className="eyebrow">The classifier says</div>
          <div className="mt-3 font-display text-3xl font-semibold tracking-tight text-bone">
            {result.predicted_class}
          </div>
          <div className="num mt-3 flex items-baseline gap-2">
            <span className="text-2xl leading-none text-bone">
              {(result.confidence * 100).toFixed(1)}
              <span className="text-sm text-faint">%</span>
            </span>
            <span className="text-[0.7rem] text-faint">calibrated confidence</span>
          </div>
          <p className="mt-4 max-w-xs text-[0.7rem] leading-relaxed text-faint">
            Temperature-scaled on a held-out split. Confidence measures distance from the decision
            boundary — nothing else.
          </p>
        </div>

        {/* --- what the guardrail decided --- */}
        <div className="p-5" style={{ background: `color-mix(in oklab, ${c} 7%, transparent)` }}>
          <div className="eyebrow">ScanProof says</div>
          <div className="mt-3">
            <VerdictChip verdict={result.verdict} size="hero" />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-mute">
            {VERDICT_MEANING[result.verdict]}.
          </p>
          <div className="num mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-rule-soft pt-3 text-[0.7rem] text-faint">
            <span>
              <span style={{ color: nPassed === 4 ? "var(--color-pass)" : "var(--color-review)" }}>
                {nPassed}
              </span>{" "}
              of 4 checks clear
            </span>
            <span>·</span>
            <span>score {result.reliability_score.toFixed(1)}/100</span>
            {result.gates.length > 0 && (
              <>
                <span>·</span>
                <span style={{ color: c }}>{result.gates.length} gate applied</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* --- the four checks: the evidence a reviewer acts on --- */}
      <div className="border-t border-rule-soft px-5 py-4">
        <div className="eyebrow mb-3">Four independent checks · worst first</div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
          {checks.map(({ sub, status }) => (
            <Check key={sub.key} sub={sub} status={status} result={result} />
          ))}
        </div>
      </div>

      {result.gates.length > 0 && (
        <div className="border-t border-rule-soft px-5 py-4">
          <div className="eyebrow mb-2.5">Hard gates applied</div>
          <ul className="space-y-1.5">
            {result.gates.map((g, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-mute">
                <span className="num shrink-0" style={{ color: c }} aria-hidden>
                  ▸
                </span>
                <span>{g}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[0.7rem] leading-relaxed text-faint">
            A gate overrides the weighted score outright. Some failures should not be averaged away
            by good numbers elsewhere.
          </p>
        </div>
      )}
    </div>
  );
}

function Check({
  sub,
  status,
  result,
}: {
  sub: SubScore;
  status: Status;
  result: ReliabilityResult;
}) {
  const tone = STATUS_TONE[status];
  const pct = (sub.points / sub.max_points) * 100;

  return (
    <div className="flex gap-3">
      <span
        className="num mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center text-[0.65rem] font-semibold"
        style={{
          color: tone,
          background: `color-mix(in oklab, ${tone} 15%, transparent)`,
          borderRadius: 2,
        }}
        aria-hidden
      >
        {STATUS_GLYPH[status]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[0.82rem] font-medium text-bone">{sub.label}</span>
          <span className="num shrink-0 text-[0.65rem] text-faint">
            {sub.points.toFixed(1)}/{sub.max_points.toFixed(0)}
          </span>
        </div>
        <div className="num mt-1 text-[0.72rem]" style={{ color: tone }}>
          {measurementOf(sub.key, result)}
        </div>
        <div className="mt-1.5 h-[3px] w-full bg-panel-2" style={{ borderRadius: 1 }}>
          <div
            className="h-full"
            style={{ width: `${pct}%`, backgroundColor: tone, borderRadius: 1 }}
          />
        </div>
        <div className="mt-1 text-[0.65rem] leading-snug text-faint">{ASKS[sub.key]}</div>
      </div>
    </div>
  );
}

export { VERDICT_GLYPH };
