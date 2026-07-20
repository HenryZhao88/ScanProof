import type { ReliabilityResult } from "../types";
import { Panel } from "./ui";

/** Three checkpoints, three votes on the same film. A wide spread means the
 *  answer depends on which model you happened to ship. */
export function CheckpointVote({ result }: { result: ReliabilityResult }) {
  const { members, std, unanimous } = result.ensemble;

  return (
    <Panel
      eyebrow="Signal · checkpoint agreement"
      title="Three independently trained models"
      aside={
        <div className="num text-xs">
          <span style={{ color: unanimous ? "var(--color-pass)" : "var(--color-block)" }}>
            {unanimous ? "unanimous" : "split vote"}
          </span>
          <span className="ml-2 text-faint">σ {std.toFixed(3)}</span>
        </div>
      }
    >
      <div className="space-y-3">
        {members.map((m) => {
          const agrees = m.predicted_class === result.predicted_class;
          const tone = agrees ? "var(--color-instrument)" : "var(--color-block)";
          return (
            <div key={m.name}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="num text-[0.72rem] text-mute">{m.name}</span>
                <span className="num text-[0.72rem]">
                  <span className="text-bone">{m.prob_pneumonia.toFixed(3)}</span>
                  <span className="ml-2" style={{ color: tone }}>
                    {agrees ? "" : "✕ "}
                    {m.predicted_class}
                  </span>
                </span>
              </div>
              <div className="relative mt-1.5 h-2 w-full bg-panel-2" style={{ borderRadius: 1 }}>
                <div
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${m.prob_pneumonia * 100}%`, background: tone, borderRadius: 1 }}
                />
                {/* the decision boundary, on every bar */}
                <div className="absolute inset-y-[-2px] left-1/2 w-px bg-bone/45" />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3.5 border-t border-rule-soft pt-3 text-[0.7rem] leading-relaxed text-faint">
        Bars show P(PNEUMONIA); the hairline is the 0.50 boundary. Members differ by architecture
        (two ResNet-18, one DenseNet-121), seed and augmentation, so disagreement reflects more than
        seed noise.
      </p>
    </Panel>
  );
}

/** Where this image sits relative to the training manifold. */
export function EmbeddingDistance({ result }: { result: ReliabilityResult }) {
  const { percentile, distance, hard_gate_percentile, soft_gate_percentile } = result.ood;
  const pct = percentile * 100;
  const beyondHard = percentile >= hard_gate_percentile;
  const beyondSoft = percentile >= soft_gate_percentile;
  const tone = beyondHard
    ? "var(--color-block)"
    : beyondSoft
      ? "var(--color-review)"
      : "var(--color-pass)";

  return (
    <Panel
      eyebrow="Signal · embedding typicality"
      title="Distance from the training distribution"
      aside={
        <div className="num text-xs" style={{ color: tone }}>
          {pct.toFixed(1)}
          <span className="text-faint">th pct</span>
        </div>
      }
    >
      <div className="relative pt-6">
        {/* marker */}
        <div
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${Math.min(99, Math.max(1, pct))}%` }}
        >
          <div className="num text-[0.65rem]" style={{ color: tone }}>
            this image
          </div>
        </div>
        <div className="relative h-3 w-full overflow-hidden bg-panel-2" style={{ borderRadius: 1 }}>
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${soft_gate_percentile * 100}%`,
              background: "color-mix(in oklab, var(--color-pass) 22%, transparent)",
            }}
          />
          <div
            className="absolute inset-y-0"
            style={{
              left: `${soft_gate_percentile * 100}%`,
              width: `${(hard_gate_percentile - soft_gate_percentile) * 100}%`,
              background: "color-mix(in oklab, var(--color-review) 30%, transparent)",
            }}
          />
          <div
            className="hatch absolute inset-y-0 right-0"
            style={{
              left: `${hard_gate_percentile * 100}%`,
              background: "color-mix(in oklab, var(--color-block) 40%, transparent)",
            }}
          />
          <div
            className="absolute inset-y-[-3px] w-[3px]"
            style={{ left: `calc(${Math.min(100, pct)}% - 1.5px)`, background: tone }}
          />
        </div>
        <div className="num mt-1.5 flex justify-between text-[0.6rem] text-faint">
          <span>typical</span>
          <span>atypical {soft_gate_percentile * 100}</span>
          <span>gate {hard_gate_percentile * 100}</span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-rule-soft pt-3">
        <div>
          <dt className="eyebrow">Mahalanobis distance</dt>
          <dd className="num mt-1.5 text-lg text-bone">{distance.toFixed(1)}</dd>
        </div>
        <div>
          <dt className="eyebrow">Training images closer</dt>
          <dd className="num mt-1.5 text-lg text-bone">{pct.toFixed(1)}%</dd>
        </div>
      </dl>
      <p className="mt-3 text-[0.7rem] leading-relaxed text-faint">
        Class-conditional Mahalanobis distance in the penultimate feature space of{" "}
        <span className="num">m0-resnet18</span>, expressed as a percentile of the training
        distribution. Past the gate the classifier has no comparable examples to reason from, so its
        output is not interpretable at any confidence.
      </p>
    </Panel>
  );
}
