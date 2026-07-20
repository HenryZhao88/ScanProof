import type { AnalysisResponse } from "../types";

/** The film itself. It is the only bright object on the page — everything else
 *  is instrument chrome around it. */
export function Specimen({ analysis }: { analysis: AnalysisResponse }) {
  const truth = analysis.true_class;
  const correct =
    truth && truth !== "n/a — not a chest film" && truth !== "n/a — synthetic"
      ? truth === analysis.result.predicted_class
      : null;

  return (
    <div className="border border-rule-soft bg-panel" style={{ borderRadius: 3 }}>
      <div className="border-b border-rule-soft px-5 py-3.5">
        <div className="eyebrow">Specimen under test</div>
        <h2 className="mt-1.5 font-display text-[0.95rem] font-medium tracking-tight text-bone">
          {analysis.title}
        </h2>
      </div>

      <div className="p-4">
        <div className="relative bg-black" style={{ borderRadius: 2 }}>
          <img
            src={analysis.image_url}
            alt={`Specimen: ${analysis.title}`}
            className="mx-auto block w-full max-w-[340px]"
            style={{ borderRadius: 2, imageRendering: "auto" }}
          />
          <div className="num pointer-events-none absolute bottom-2 left-2 bg-black/65 px-1.5 py-0.5 text-[0.6rem] text-bone/70">
            224 × 224 · grayscale
          </div>
        </div>

        {analysis.why_included && (
          <p className="mt-4 border-l-2 border-rule pl-3 text-xs leading-relaxed text-mute">
            {analysis.why_included}
          </p>
        )}

        <dl className="mt-4 space-y-2 border-t border-rule-soft pt-3.5 text-[0.7rem]">
          {truth && (
            <Row label="Ground truth">
              <span className="num text-bone">{truth}</span>
              {correct !== null && (
                <span
                  className="num ml-2"
                  style={{ color: correct ? "var(--color-pass)" : "var(--color-block)" }}
                >
                  {correct ? "✓ model correct" : "✕ model wrong"}
                </span>
              )}
            </Row>
          )}
          <Row label="Source">
            <span className="num text-mute">{analysis.source}</span>
          </Row>
          {analysis.license && (
            <Row label="License">
              <span className="text-mute">{analysis.license}</span>
            </Row>
          )}
          <Row label="Computed">
            <span className="num text-mute">
              {analysis.live ? `live, ${analysis.elapsed_ms} ms` : "cached result"}
            </span>
          </Row>
        </dl>

        {!analysis.live && analysis.note && (
          <p className="mt-3 text-[0.68rem] leading-relaxed text-review">{analysis.note}</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="eyebrow w-24 shrink-0 pt-[1px]">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}
