import type { AnalysisResponse } from "../types";

/**
 * The radiograph, mounted. It is the only dark object on the page — which is
 * how a film appears in a printed report, and the reverse of a viewer
 * application where the film is the background.
 *
 * Provenance sits underneath as a form block, because on a certificate the
 * chain of custody is part of the document, not a footnote.
 */
export function Specimen({ analysis }: { analysis: AnalysisResponse }) {
  const truth = analysis.true_class;
  const isChestFilm = truth && !truth.startsWith("n/a");
  const correct = isChestFilm ? truth === analysis.result.predicted_class : null;

  return (
    <div className="border border-rule bg-sheet">
      <div className="border-b-2 border-rule-hard px-5 py-4">
        <div className="field">Specimen</div>
        <h2 className="mt-1.5 font-display text-[1.0625rem] font-semibold leading-tight tracking-[-0.011em] text-ink">
          {analysis.title}
        </h2>
      </div>

      <div className="p-5">
        <figure className="plate relative">
          <img
            src={analysis.image_url}
            alt={`Radiograph: ${analysis.title}`}
            className="mx-auto block w-full max-w-[330px]"
          />
          <figcaption className="num pointer-events-none absolute bottom-3 left-3 bg-black/60 px-1.5 py-0.5 text-[0.6rem] text-white/70">
            224 × 224 · grayscale
          </figcaption>
        </figure>

        {analysis.why_included && (
          <p className="mt-4 border-l-2 border-rule pl-3 text-[0.78rem] leading-relaxed text-graphite">
            {analysis.why_included}
          </p>
        )}

        <dl className="mt-5 space-y-0 border-t-2 border-rule-hard pt-1 text-[0.75rem]">
          {truth && (
            <Row label="Ground truth">
              <span className="num text-ink">{truth}</span>
              {correct !== null && (
                <span
                  className="num ml-2 text-[0.95em]"
                  style={{
                    color: correct ? "var(--color-pass-ink)" : "var(--color-block-ink)",
                  }}
                >
                  {correct ? "✓ model correct" : "✕ model wrong"}
                </span>
              )}
            </Row>
          )}
          <Row label="Source">
            <span className="num text-graphite">{analysis.source}</span>
          </Row>
          {analysis.license && (
            <Row label="License">
              <span className="text-graphite">{analysis.license}</span>
            </Row>
          )}
          <Row label="Computed">
            <span className="num text-graphite">
              {analysis.live ? `live · ${analysis.elapsed_ms} ms` : "cached result"}
            </span>
          </Row>
        </dl>

        {!analysis.live && analysis.note && (
          <p
            className="mt-3 text-[0.72rem] leading-relaxed"
            style={{ color: "var(--color-review-ink)" }}
          >
            {analysis.note}
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 border-b border-rule py-2 last:border-b-0">
      <dt className="field w-24 shrink-0 pt-[3px]">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}
