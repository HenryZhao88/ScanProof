import type { ReliabilityResult, SubScore } from "../types";
import { VERDICT_COLOR, VERDICT_MEANING, VerdictChip } from "./ui";

/**
 * The split readout. Model confidence and ScanProof's reliability verdict sit
 * in two adjacent cells with a hard rule between them, because the entire
 * product claim is that these are different quantities. Putting them in one
 * card with one number would argue the opposite.
 */
export function VerdictPanel({ result }: { result: ReliabilityResult }) {
  const c = VERDICT_COLOR[result.verdict];

  return (
    <div className="border border-rule-soft bg-panel" style={{ borderRadius: 3 }}>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {/* --- what the classifier says --- */}
        <div className="border-b border-rule-soft p-5 sm:border-r sm:border-b-0">
          <div className="eyebrow">The classifier says</div>
          <div className="mt-3 font-display text-2xl font-semibold tracking-tight text-bone">
            {result.predicted_class}
          </div>
          <div className="num mt-3 flex items-baseline gap-2">
            <span className="text-3xl leading-none text-bone">
              {(result.confidence * 100).toFixed(1)}
              <span className="text-base text-faint">%</span>
            </span>
            <span className="text-[0.7rem] text-faint">calibrated confidence</span>
          </div>
          <div className="num mt-3 text-xs text-mute">
            P(PNEUMONIA) {result.prob_pneumonia.toFixed(4)}
          </div>
          <p className="mt-3 text-[0.7rem] leading-relaxed text-faint">
            Temperature-scaled on a held-out split. Scaling changes the number, never the label.
          </p>
        </div>

        {/* --- what ScanProof says --- */}
        <div
          className="p-5"
          style={{ background: `color-mix(in oklab, ${c} 6%, transparent)` }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="eyebrow">ScanProof says</div>
            <VerdictChip verdict={result.verdict} size="lg" />
          </div>
          <div className="num mt-3 flex items-baseline gap-2">
            <span className="text-[2.75rem] leading-none" style={{ color: c }}>
              {result.reliability_score.toFixed(1)}
            </span>
            <span className="text-[0.7rem] text-faint">/ 100 reliability</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-mute">
            {VERDICT_MEANING[result.verdict]}.
          </p>
          <ThresholdRule result={result} />
        </div>
      </div>

      <div className="border-t border-rule-soft px-5 py-4">
        <div className="eyebrow mb-3">Where the score came from</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {result.subscores.map((s) => (
            <SubScoreMeter key={s.key} sub={s} />
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
            Gates override the weighted score. A failure this specific should not be averaged away
            by good numbers elsewhere.
          </p>
        </div>
      )}
    </div>
  );
}

/** Shows where this case sits against the two thresholds, on the same scale as
 *  the score itself. */
function ThresholdRule({ result }: { result: ReliabilityResult }) {
  const { pass, review } = result.thresholds;
  const c = VERDICT_COLOR[result.verdict];
  return (
    <div className="mt-4">
      <div className="relative h-1.5 w-full bg-panel-2" style={{ borderRadius: 1 }}>
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${review}%`, background: "color-mix(in oklab, var(--color-block) 30%, transparent)" }}
        />
        <div
          className="absolute inset-y-0"
          style={{
            left: `${review}%`,
            width: `${pass - review}%`,
            background: "color-mix(in oklab, var(--color-review) 30%, transparent)",
          }}
        />
        <div
          className="absolute inset-y-0 right-0"
          style={{ left: `${pass}%`, background: "color-mix(in oklab, var(--color-pass) 30%, transparent)" }}
        />
        <div
          className="absolute -top-1 h-3.5 w-[3px]"
          style={{ left: `calc(${Math.min(100, result.reliability_score)}% - 1.5px)`, background: c }}
        />
      </div>
      <div className="num mt-1.5 flex justify-between text-[0.6rem] text-faint">
        <span>0</span>
        <span>BLOCK · REVIEW {review}</span>
        <span>REVIEW · PASS {pass}</span>
        <span>100</span>
      </div>
    </div>
  );
}

/**
 * The deducted points are drawn, not omitted. A bar that simply stops short
 * shows what was earned; the hatched remainder shows what was taken away and
 * makes the arithmetic legible.
 */
function SubScoreMeter({ sub }: { sub: SubScore }) {
  const earnedPct = (sub.points / sub.max_points) * 100;
  const lost = sub.max_points - sub.points;
  const tone =
    sub.value >= 0.85
      ? "var(--color-pass)"
      : sub.value >= 0.55
        ? "var(--color-review)"
        : "var(--color-block)";

  return (
    <div className="group">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-xs font-medium text-bone">{sub.label}</span>
        <span className="num text-[0.7rem] text-mute">
          <span style={{ color: tone }}>{sub.points.toFixed(1)}</span>
          <span className="text-faint"> / {sub.max_points.toFixed(0)} pts</span>
        </span>
      </div>
      <div className="mt-1.5 flex h-2 w-full gap-[2px] overflow-hidden bg-panel-2" style={{ borderRadius: 1 }}>
        <div style={{ width: `${earnedPct}%`, background: tone, borderRadius: 1 }} />
        {lost > 0.05 && (
          <div
            className="hatch"
            style={{
              width: `${100 - earnedPct}%`,
              borderRadius: 1,
              background: "color-mix(in oklab, var(--color-block) 16%, transparent)",
            }}
            title={`${lost.toFixed(1)} points deducted`}
          />
        )}
      </div>
      <p className="mt-1.5 text-[0.7rem] leading-relaxed text-faint">{sub.detail}</p>
    </div>
  );
}
