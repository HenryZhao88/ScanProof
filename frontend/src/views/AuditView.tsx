import { useEffect, useState } from "react";
import { api } from "../api";
import { ErrorState, Panel, Readout, Skeleton, VERDICT_COLOR, VERDICT_GLYPH } from "../components/ui";
import { ReliabilityDiagram } from "../components/charts/ReliabilityDiagram";
import { RiskCoverage } from "../components/charts/RiskCoverage";
import type { Audit } from "../types";

export function AuditView() {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api
      .audit()
      .then(setAudit)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(load, []);

  if (error) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-8">
        <ErrorState title="Audit artifact unavailable" detail={error} onRetry={load} />
      </div>
    );
  }
  if (!audit) {
    return (
      <div className="mx-auto max-w-[1560px] space-y-4 px-5 py-5">
        <Skeleton className="h-32" />
        <Skeleton className="h-80" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const c = audit.classification.test;
  const cal = audit.calibration;
  const sp = audit.selective_prediction;
  const bands = audit.reliability_bands.test;
  const passBand = bands.find((b) => b.band === "PASS");
  const errorsOutsidePass = bands
    .filter((b) => b.band !== "PASS")
    .reduce((a, b) => a + b.share_of_all_errors, 0);

  return (
    <div className="mx-auto max-w-[1560px] space-y-4 px-5 py-5">
      {/* ---- what this page is -------------------------------------- */}
      <section className="border border-rule-soft bg-panel px-5 py-4" style={{ borderRadius: 3 }}>
        <div className="eyebrow">Aggregate audit</div>
        <h1 className="mt-2 max-w-3xl font-display text-xl font-semibold tracking-tight text-bone">
          Every number below was computed by{" "}
          <span className="num text-instrument">{audit.generated_by}</span> over the{" "}
          {c.n}-image held-out test split.
        </h1>
        <p className="mt-2.5 max-w-3xl text-xs leading-relaxed text-mute">
          Thresholds were chosen on the {audit.splits.threshold_selection.n}-image validation split
          and frozen before this split was touched, so nothing here is tuned on what it reports.
          Generated {audit.generated_at_utc} on {audit.model.device}.
        </p>
      </section>

      {/* ---- headline: does the reliability score beat confidence? --- */}
      <Panel
        eyebrow="Headline result · selective prediction"
        title="Ranking by reliability catches more errors than ranking by confidence"
        aside={
          <div className="num text-xs text-faint">
            AURC{" "}
            <span className="text-instrument">{sp.by_reliability_score.aurc.toFixed(4)}</span>
            {" vs "}
            <span className="text-bone/60">{sp.by_confidence_only.aurc.toFixed(4)}</span>
          </div>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <RiskCoverage
            subject={sp.by_reliability_score.points}
            control={sp.by_confidence_only.points}
            subjectLabel="Ranked by reliability score"
            controlLabel="Ranked by confidence only"
          />
          <div className="space-y-4">
            <Readout
              label="Errors outside the PASS band"
              value={`${(errorsOutsidePass * 100).toFixed(0)}%`}
              color="var(--color-instrument)"
              sub={`${bands.filter((b) => b.band !== "PASS").reduce((a, b) => a + b.errors, 0)} of the ${bands.reduce((a, b) => a + b.errors, 0)} test errors are withheld from PASS — without the engine ever seeing a label.`}
            />
            <div className="border-t border-rule-soft pt-3">
              <p className="text-[0.7rem] leading-relaxed text-faint">{sp.note}</p>
            </div>
          </div>
        </div>
      </Panel>

      {/* ---- band table --------------------------------------------- */}
      <Panel
        eyebrow="Verdict bands"
        title="Accuracy and coverage per band, test split"
        aside={
          <div className="num text-xs text-faint">
            PASS ≥ {audit.reliability_bands.thresholds.pass} · REVIEW ≥{" "}
            {audit.reliability_bands.thresholds.review}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead>
              <tr className="eyebrow border-b border-rule">
                <th className="py-2 pr-4 font-normal">Band</th>
                <th className="py-2 pr-4 font-normal">Coverage</th>
                <th className="py-2 pr-4 text-right font-normal">n</th>
                <th className="py-2 pr-4 text-right font-normal">Accuracy</th>
                <th className="py-2 pr-4 text-right font-normal">Errors</th>
                <th className="py-2 pr-4 text-right font-normal">Mean score</th>
                <th className="py-2 text-right font-normal">Mean confidence</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b) => {
                const vc = VERDICT_COLOR[b.band];
                return (
                  <tr key={b.band} className="border-b border-rule-soft">
                    <td className="py-3 pr-4">
                      <span className="num font-semibold" style={{ color: vc }}>
                        {VERDICT_GLYPH[b.band]} {b.band}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 bg-panel-2" style={{ borderRadius: 1 }}>
                          <div
                            className={b.band === "BLOCK" ? "hatch h-full" : "h-full"}
                            style={{
                              width: `${b.coverage * 100}%`,
                              background: vc,
                              borderRadius: 1,
                            }}
                          />
                        </div>
                        <span className="num text-mute">{(b.coverage * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="num py-3 pr-4 text-right text-mute">{b.n}</td>
                    <td className="num py-3 pr-4 text-right text-base text-bone">
                      {b.accuracy === null ? "—" : (b.accuracy * 100).toFixed(1) + "%"}
                    </td>
                    <td className="num py-3 pr-4 text-right text-mute">{b.errors}</td>
                    <td className="num py-3 pr-4 text-right text-mute">
                      {b.mean_reliability_score?.toFixed(1) ?? "—"}
                    </td>
                    <td className="num py-3 text-right text-mute">
                      {b.mean_confidence === null ? "—" : (b.mean_confidence * 100).toFixed(1) + "%"}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="py-3 pr-4 font-display text-[0.75rem] text-mute">All cases</td>
                <td className="num py-3 pr-4 text-mute">100.0%</td>
                <td className="num py-3 pr-4 text-right text-mute">{c.n}</td>
                <td className="num py-3 pr-4 text-right text-base text-mute">
                  {(c.accuracy * 100).toFixed(1)}%
                </td>
                <td className="num py-3 pr-4 text-right text-mute">
                  {bands.reduce((a, b) => a + b.errors, 0)}
                </td>
                <td className="num py-3 pr-4 text-right text-faint">—</td>
                <td className="num py-3 text-right text-faint">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 border-t border-rule-soft pt-3 text-[0.7rem] leading-relaxed text-faint">
          The PASS band reaches{" "}
          <span className="num text-bone">
            {passBand?.accuracy != null ? (passBand.accuracy * 100).toFixed(1) + "%" : "—"}
          </span>{" "}
          against{" "}
          <span className="num text-bone">{(c.accuracy * 100).toFixed(1)}%</span> over all cases.
          That gap is the value the reliability signals add — and it is not a guarantee: {passBand?.errors ?? 0}{" "}
          errors still reach PASS.
        </p>
      </Panel>

      {/* ---- calibration + classification --------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel eyebrow="Confidence calibration" title="Before and after temperature scaling">
          <div className="mb-4 grid grid-cols-3 gap-4">
            <Readout
              label="ECE"
              value={cal.ece_calibrated.toFixed(4)}
              color="var(--color-instrument)"
              sub={`from ${cal.ece_raw.toFixed(4)} raw`}
            />
            <Readout
              label="Brier"
              value={cal.brier_calibrated.toFixed(4)}
              sub={`from ${cal.brier_raw.toFixed(4)}`}
            />
            <Readout
              label="NLL"
              value={cal.nll_calibrated.toFixed(4)}
              sub={`from ${cal.nll_raw.toFixed(4)}`}
            />
          </div>
          <ReliabilityDiagram bins={cal.reliability_diagram.calibrated} />
          <p className="mt-3 text-[0.7rem] leading-relaxed text-faint">{cal.note}</p>
        </Panel>

        <Panel eyebrow="Classifier performance" title="Held-out test split">
          <div className="grid grid-cols-2 gap-5">
            <Readout label="Accuracy" value={(c.accuracy * 100).toFixed(1)} unit="%" size="xl" />
            <Readout label="AUROC" value={c.auroc.toFixed(4)} size="xl" />
            <Readout label="Sensitivity" value={(c.sensitivity * 100).toFixed(1)} unit="%" />
            <Readout label="Specificity" value={(c.specificity * 100).toFixed(1)} unit="%" />
          </div>
          <div className="mt-5 border-t border-rule-soft pt-4">
            <div className="eyebrow mb-2.5">Confusion matrix</div>
            <div className="grid max-w-[280px] grid-cols-2 gap-[2px]">
              {(
                [
                  ["True positive", c.confusion.tp],
                  ["False positive", c.confusion.fp],
                  ["False negative", c.confusion.fn],
                  ["True negative", c.confusion.tn],
                ] as [string, number][]
              ).map(([label, n]) => (
                <div key={label} className="bg-panel-2 px-3 py-2.5" style={{ borderRadius: 2 }}>
                  <div className="num text-lg text-bone">{n}</div>
                  <div className="mt-0.5 text-[0.62rem] text-faint">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-4 text-[0.7rem] leading-relaxed text-faint">
            Validation accuracy is {(audit.classification.validation.accuracy * 100).toFixed(1)}%.
            The drop on test is a property of PneumoniaMNIST: its test split comes from a different
            source collection than train/val, so it carries a genuine distribution shift. That shift
            is what makes this a useful reliability benchmark.
          </p>
        </Panel>
      </div>

      {/* ---- robustness --------------------------------------------- */}
      <Panel
        eyebrow="Perturbation battery"
        title="Ensemble accuracy under each test, across all 624 test images"
        aside={
          <div className="num text-xs text-faint">
            clean accuracy {(audit.robustness.clean_accuracy * 100).toFixed(1)}%
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="eyebrow border-b border-rule">
                <th className="py-2 pr-4 font-normal">Test family</th>
                {[1, 2, 3].map((s) => (
                  <th key={s} colSpan={2} className="py-2 pr-4 text-center font-normal">
                    Severity {s}
                  </th>
                ))}
              </tr>
              <tr className="eyebrow border-b border-rule-soft">
                <th className="py-1.5 pr-4 font-normal" />
                {[1, 2, 3].map((s) => (
                  <>
                    <th key={`a${s}`} className="py-1.5 pr-2 text-right font-normal">
                      acc
                    </th>
                    <th key={`f${s}`} className="py-1.5 pr-4 text-right font-normal">
                      flips
                    </th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {audit.robustness.families.map((f) => (
                <tr key={f.family} className="border-b border-rule-soft">
                  <td className="py-2.5 pr-4">
                    <div className="font-display text-[0.75rem] font-medium text-bone">
                      {f.family_label}
                    </div>
                    <div className="text-[0.65rem] text-faint">{f.description}</div>
                  </td>
                  {f.severities.map((s) => (
                    <>
                      <td key={`a${s.severity}`} className="num py-2.5 pr-2 text-right">
                        <span className="text-bone">{(s.accuracy * 100).toFixed(1)}</span>
                        <span className="ml-1 text-[0.62rem] text-faint">
                          {s.accuracy_drop > 0.0005
                            ? `−${(s.accuracy_drop * 100).toFixed(1)}`
                            : "—"}
                        </span>
                      </td>
                      <td
                        key={`f${s.severity}`}
                        className="num py-2.5 pr-4 text-right"
                        style={{
                          color:
                            s.flip_rate > 0.08
                              ? "var(--color-block)"
                              : s.flip_rate > 0.03
                                ? "var(--color-review)"
                                : "var(--color-faint)",
                        }}
                      >
                        {(s.flip_rate * 100).toFixed(1)}%
                      </td>
                    </>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 border-t border-rule-soft pt-3 text-[0.7rem] leading-relaxed text-faint">
          "flips" is the share of images whose predicted label changed under that test alone.
          Sorted by worst-severity flip rate — the families at the top are the ones this classifier
          is least robust to.
        </p>
      </Panel>

      {/* ---- OOD + provenance --------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel eyebrow="Out-of-distribution detection" title="Chest films vs. a different modality">
          <div className="grid grid-cols-2 gap-5">
            <Readout
              label="Detection AUROC"
              value={audit.ood.detection_auroc.toFixed(4)}
              color="var(--color-instrument)"
              size="xl"
            />
            <Readout
              label="OOD probes gated"
              value={(audit.ood.out_of_distribution.frac_above_hard_gate * 100).toFixed(0)}
              unit="%"
              size="xl"
            />
          </div>
          <dl className="mt-5 space-y-2.5 border-t border-rule-soft pt-4 text-[0.72rem]">
            <div className="flex justify-between gap-3">
              <dt className="text-mute">{audit.ood.in_distribution.source}</dt>
              <dd className="num shrink-0 text-bone">
                mean pct {(audit.ood.in_distribution.mean_percentile * 100).toFixed(1)} · gated{" "}
                {(audit.ood.in_distribution.frac_above_hard_gate * 100).toFixed(1)}%
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-mute">{audit.ood.out_of_distribution.source}</dt>
              <dd className="num shrink-0 text-bone">
                mean pct {(audit.ood.out_of_distribution.mean_percentile * 100).toFixed(1)} · gated{" "}
                {(audit.ood.out_of_distribution.frac_above_hard_gate * 100).toFixed(1)}%
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[0.7rem] leading-relaxed text-faint">{audit.ood.method}.</p>
        </Panel>

        <Panel eyebrow="Provenance" title="Data, models and scoring">
          <dl className="space-y-3 text-[0.72rem]">
            <Field label="Dataset">
              <span className="text-bone">{audit.dataset.python_class}</span> · {audit.dataset.license}
              <div className="num mt-1 break-all text-[0.65rem] text-faint">
                {audit.dataset.source_url}
              </div>
            </Field>
            <Field label="Splits">
              <span className="num">
                {Object.entries(audit.dataset.n_samples)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(" · ")}
              </span>
            </Field>
            <Field label="Ensemble">
              <div className="space-y-1">
                {audit.model.members.map((m) => (
                  <div key={m.name} className="num text-[0.68rem]">
                    <span className="text-bone">{m.name}</span>
                    <span className="text-faint">
                      {" "}
                      · {m.arch} · seed {m.seed} · aug {m.augment} · T {m.temperature}
                    </span>
                  </div>
                ))}
              </div>
            </Field>
            <Field label="Weights">
              <span className="num">
                {Object.entries(audit.model.weights)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(" · ")}
              </span>
            </Field>
            <Field label="Thresholds">
              <span className="text-mute">{audit.model.thresholds.source}</span>
            </Field>
          </dl>
        </Panel>
      </div>

      <p className="pb-6 text-center text-[0.68rem] leading-relaxed text-faint">
        {audit.disclaimer}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="eyebrow w-20 shrink-0 pt-[2px]">{label}</dt>
      <dd className="min-w-0 flex-1 text-mute">{children}</dd>
    </div>
  );
}
