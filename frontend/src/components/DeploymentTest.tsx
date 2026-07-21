import { DivergenceChart, type ArmPoint } from "./charts/DivergenceChart";
import { TwoRegime } from "./charts/TwoRegime";
import { Panel, Readout, VERDICT_COLOR, VERDICT_GLYPH } from "./ui";
import type { ShiftStudy, Verdict } from "../types";

const SHORT: Record<string, string> = {
  in_distribution: "pediatric\nnative res",
  resolution_control: "pediatric\nshift-set res",
  domain_shift: "ADULT\nother hospital",
  wrong_modality: "ultrasound\nwrong modality",
};

/**
 * The headline of the audit. Everything above it in the page is context;
 * everything below it is supporting detail.
 */
export function DeploymentTest({ study }: { study: ShiftStudy }) {
  const a = study.answer;
  const arms: ArmPoint[] = study.arms.map((arm) => ({
    label: arm.label,
    short: SHORT[arm.name] ?? arm.name,
    emphasis: arm.name === "domain_shift",
    confidence: arm.model_confidence.mean,
    passRate: arm.verdicts.PASS.share,
    accuracy: arm.accuracy?.mean ?? null,
    n: arm.n,
  }));

  const ctrl = study.resolution_control;
  const controlHolds = Math.abs(ctrl.pass_rate_delta) <= 0.2;
  const adult = study.arms.find((x) => x.name === "domain_shift")!;
  const ped = study.arms.find((x) => x.name === "resolution_control")!;

  return (
    <>
      <Panel
        eyebrow="Headline result · the deployment test"
        title="The model is just as confident on patients it has never seen. Its accuracy is not."
      >
        <p className="mb-5 max-w-3xl text-xs leading-relaxed text-mute">
          The ensemble was fine-tuned on pediatric chest films from one hospital in Guangzhou. Here
          it is run on adult chest films from the NIH Clinical Center — same modality, same view,
          same question, different patients and different scanners. This is not a contrived input;
          it is the single most common way a deployed imaging model fails.
        </p>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <DivergenceChart arms={arms} />

          <div className="space-y-5">
            <Readout
              label="Confidence, pediatric → adult"
              value={`${(a.pediatric_confidence * 100).toFixed(1)} → ${(a.adult_confidence * 100).toFixed(1)}`}
              unit="%"
              color="var(--color-block)"
              sub="The model barely notices. A two-class softmax is normalised over the two classes it knows, so it has no way to represent “this is not my kind of input”."
            />
            <div className="border-t border-rule-soft pt-4">
              <Readout
                label="Accuracy, pediatric → adult"
                value={`${(a.pediatric_accuracy * 100).toFixed(1)} → ${(a.adult_accuracy * 100).toFixed(1)}`}
                unit="%"
                color="var(--color-block)"
                sub="Same films, same task. The drop is what confidence failed to warn about."
              />
            </div>
            <div className="border-t border-rule-soft pt-4">
              <Readout
                label="ScanProof PASS rate"
                value={`${(a.pediatric_pass_rate * 100).toFixed(1)} → ${(a.adult_pass_rate * 100).toFixed(1)}`}
                unit="%"
                color="var(--color-pass)"
                sub="Withheld on evidence, with no access to a label and no knowledge that the population changed."
              />
            </div>
          </div>
        </div>
      </Panel>

      {/* ---- the confound control, stated before anyone has to ask ---- */}
      <Panel
        eyebrow="Confound control"
        title="Is this just a resolution artifact?"
        aside={
          <div
            className="num text-xs"
            style={{ color: controlHolds ? "var(--color-pass)" : "var(--color-block)" }}
          >
            {controlHolds ? "✓ controlled" : "✕ not controlled"}
          </div>
        }
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <p className="max-w-2xl text-xs leading-relaxed text-mute">
            {ctrl.purpose} The pediatric films are shown twice below — once at native resolution,
            once through the adult set's exact resampling path. If those two rows disagreed, the
            study would be measuring image processing rather than population.
          </p>
          <dl className="space-y-2 text-[0.72rem]">
            {(
              [
                ["PASS rate", ctrl.pass_rate_delta, true],
                ["Accuracy", ctrl.accuracy_delta, true],
                ["Confidence", ctrl.confidence_delta, true],
                ["Embedding percentile", ctrl.ood_percentile_delta, true],
              ] as [string, number, boolean][]
            ).map(([label, delta]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="text-mute">{label} Δ (native → resampled)</dt>
                <dd
                  className="num shrink-0"
                  style={{
                    color:
                      Math.abs(delta) < 0.05 ? "var(--color-pass)" : "var(--color-review)",
                  }}
                >
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(4)}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-5 overflow-x-auto border-t border-rule-soft pt-4">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="eyebrow border-b border-rule">
                <th className="py-2 pr-4 font-normal">Arm</th>
                <th className="py-2 pr-4 text-right font-normal">n</th>
                <th className="py-2 pr-4 text-right font-normal">Accuracy</th>
                <th className="py-2 pr-4 text-right font-normal">Confidence</th>
                <th className="py-2 pr-4 text-right font-normal">Embedding pct</th>
                <th className="py-2 pr-4 text-right font-normal">Flips /21</th>
                <th className="py-2 font-normal">Verdicts</th>
              </tr>
            </thead>
            <tbody>
              {study.arms.map((arm) => (
                <tr key={arm.name} className="border-b border-rule-soft">
                  <td className="py-3 pr-4">
                    <div className="font-display text-[0.75rem] font-medium text-bone">
                      {arm.label}
                    </div>
                    <div className="max-w-[300px] text-[0.63rem] leading-snug text-faint">
                      {arm.description}
                    </div>
                  </td>
                  <td className="num py-3 pr-4 text-right text-mute">{arm.n}</td>
                  <td className="num py-3 pr-4 text-right text-bone">
                    {arm.accuracy ? `${(arm.accuracy.mean * 100).toFixed(1)}%` : "—"}
                    {arm.accuracy && (
                      <div className="text-[0.6rem] text-faint">
                        ±{(((arm.accuracy.ci_high - arm.accuracy.ci_low) / 2) * 100).toFixed(1)}
                      </div>
                    )}
                  </td>
                  <td className="num py-3 pr-4 text-right text-bone">
                    {(arm.model_confidence.mean * 100).toFixed(1)}%
                  </td>
                  <td className="num py-3 pr-4 text-right text-mute">
                    {(arm.mean_ood_percentile * 100).toFixed(1)}
                  </td>
                  <td className="num py-3 pr-4 text-right text-mute">
                    {arm.mean_flips_of_21.toFixed(1)}
                  </td>
                  <td className="py-3">
                    <div className="flex h-5 w-32 gap-[2px]">
                      {(["PASS", "REVIEW", "BLOCK"] as Verdict[]).map((b) =>
                        arm.verdicts[b].share > 0 ? (
                          <div
                            key={b}
                            className={`relative ${b === "BLOCK" ? "hatch" : ""}`}
                            style={{
                              width: `${Math.max(arm.verdicts[b].share * 100, 1.5)}%`,
                              backgroundColor: `color-mix(in oklab, ${VERDICT_COLOR[b]} 62%, transparent)`,
                              borderRadius: 2,
                            }}
                            title={`${b}: ${arm.verdicts[b].n} (${(arm.verdicts[b].share * 100).toFixed(1)}%)`}
                          />
                        ) : null,
                      )}
                    </div>
                    <div className="num mt-1 text-[0.6rem]" style={{ color: VERDICT_COLOR.PASS }}>
                      {VERDICT_GLYPH.PASS} {(arm.verdicts.PASS.share * 100).toFixed(1)}% pass
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ---- the argument for a composite score ---- */}
      <Panel
        eyebrow="Why a composite score"
        title="No signal is good at both. The composite has the best worst case."
        aside={
          <div className="num text-xs text-faint">
            best worst-case{" "}
            <span className="text-pass">{study.two_regime.best_compromise.worst_case.toFixed(3)}</span>
            {" vs "}
            <span className="text-bone/60">
              {study.two_regime.best_compromise.runner_up_worst_case.toFixed(3)}
            </span>
          </div>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <TwoRegime rows={study.two_regime.rows} />
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-mute">
              A deployed system gets one number, and two different things can go wrong. Confidence
              is the best in-distribution error ranker and the second-weakest shift detector. The
              embedding distance is the best shift detector and the worst in-distribution ranker.
              Each is excellent at one job and poor at the other.
            </p>
            <div
              className="border px-4 py-3"
              style={{
                borderColor: "color-mix(in oklab, var(--color-review) 32%, transparent)",
                background: "color-mix(in oklab, var(--color-review) 7%, transparent)",
                borderRadius: 3,
              }}
            >
              <div className="eyebrow" style={{ color: "var(--color-review)" }}>
                Reported as found
              </div>
              <p className="mt-2 text-xs leading-relaxed text-mute">
                Under the margins fixed before this study ran,{" "}
                <span className="text-bone">no signal clears both regimes</span> — including ours.
                The defensible claim is narrower: rescaling each regime so the best signal is 1 and
                the worst is 0, the composite has the highest worst case (
                <span className="num text-bone">
                  {study.two_regime.best_compromise.worst_case.toFixed(3)}
                </span>{" "}
                vs{" "}
                <span className="num text-bone">
                  {study.two_regime.best_compromise.runner_up_worst_case.toFixed(3)}
                </span>{" "}
                for {study.two_regime.best_compromise.runner_up}), and nothing beats it on both
                axes at once.
              </p>
            </div>
            <div className="space-y-2 border-t border-rule-soft pt-3">
              <div className="eyebrow mb-1">Worst case across the two regimes</div>
              {[...study.two_regime.rows]
                .sort((a, b) => b.worst_case - a.worst_case)
                .map((r) => (
                  <div key={r.signal} className="flex items-center gap-2 text-[0.7rem]">
                    <span
                      className={`w-40 shrink-0 truncate ${r.is_composite ? "text-bone" : "text-mute"}`}
                    >
                      {r.signal}
                    </span>
                    <div className="h-1.5 flex-1 bg-panel-2" style={{ borderRadius: 1 }}>
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.max(r.worst_case * 100, 1)}%`,
                          backgroundColor: r.is_composite
                            ? "var(--color-pass)"
                            : "color-mix(in oklab, var(--color-instrument) 55%, transparent)",
                          borderRadius: 1,
                        }}
                      />
                    </div>
                    <span className="num w-10 shrink-0 text-right text-bone">
                      {r.worst_case.toFixed(2)}
                    </span>
                  </div>
                ))}
            </div>
            <p className="border-t border-rule-soft pt-3 text-[0.68rem] leading-relaxed text-faint">
              {study.two_regime.note} {study.two_regime.worst_case_note}
            </p>
          </div>
        </div>
      </Panel>

      {/* ---- what fires, and does the verdict still mean anything ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel eyebrow="Signal attribution" title="Which sub-score notices the shift">
          <div className="space-y-4">
            {(["confidence", "stability", "agreement", "typicality"] as const).map((k) => {
              const p = ped.mean_subscores[k];
              const ad = adult.mean_subscores[k];
              const drop = p - ad;
              return (
                <div key={k}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-xs font-medium text-bone capitalize">{k}</span>
                    <span className="num text-[0.7rem]">
                      <span className="text-mute">{p.toFixed(3)}</span>
                      <span className="mx-1.5 text-faint">→</span>
                      <span className="text-bone">{ad.toFixed(3)}</span>
                      <span
                        className="ml-2"
                        style={{ color: drop > 0.15 ? "var(--color-block)" : "var(--color-faint)" }}
                      >
                        {drop >= 0 ? "−" : "+"}
                        {Math.abs(drop).toFixed(3)}
                      </span>
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-2 w-full bg-panel-2" style={{ borderRadius: 1 }}>
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${p * 100}%`,
                        backgroundColor: "color-mix(in oklab, var(--color-instrument) 40%, transparent)",
                        borderRadius: 1,
                      }}
                    />
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${ad * 100}%`,
                        backgroundColor: "var(--color-instrument)",
                        borderRadius: 1,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 border-t border-rule-soft pt-3 text-[0.7rem] leading-relaxed text-faint">
            Faint bar is the pediatric mean, solid bar the adult mean. The signals that move are the
            ones carrying the shift; the ones that hold are why a weighted score still leaves room
            for ordinary hard cases.
          </p>
        </Panel>

        <Panel
          eyebrow="Selective accuracy under shift"
          title="Does the verdict still carry information off-distribution?"
        >
          {adult.accuracy_by_band ? (
            <>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="eyebrow border-b border-rule">
                    <th className="py-2 pr-4 font-normal">Band</th>
                    <th className="py-2 pr-4 text-right font-normal">n</th>
                    <th className="py-2 text-right font-normal">Accuracy on adult films</th>
                  </tr>
                </thead>
                <tbody>
                  {(["PASS", "REVIEW", "BLOCK"] as Verdict[]).map((b) => {
                    const row = adult.accuracy_by_band![b];
                    return (
                      <tr key={b} className="border-b border-rule-soft">
                        <td className="py-3 pr-4">
                          <span className="num font-semibold" style={{ color: VERDICT_COLOR[b] }}>
                            {VERDICT_GLYPH[b]} {b}
                          </span>
                        </td>
                        <td className="num py-3 pr-4 text-right text-mute">{row.n}</td>
                        <td className="num py-3 text-right text-base text-bone">
                          {row.accuracy === null ? "—" : `${(row.accuracy * 100).toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="py-3 pr-4 font-display text-[0.75rem] text-mute">All adult</td>
                    <td className="num py-3 pr-4 text-right text-mute">{adult.n}</td>
                    <td className="num py-3 text-right text-base text-mute">
                      {(adult.accuracy!.mean * 100).toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 border-t border-rule-soft pt-3 text-[0.7rem] leading-relaxed text-faint">
                {String(study.shift_set.label_caveat)}
              </p>
            </>
          ) : (
            <p className="text-xs text-mute">No labelled bands for this arm.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
