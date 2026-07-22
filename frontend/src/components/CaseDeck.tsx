import { useRef, useState } from "react";
import type { DemoCase } from "../types";
import { Skeleton, VERDICT_INK, VERDICT_GLYPH } from "./ui";

/**
 * The case index. Set as a document index — numbered entries, hairline rules,
 * disposition in the margin — rather than a sidebar of cards.
 */
export function CaseDeck({
  cases,
  loading,
  selectedId,
  busyId,
  onSelect,
  onUpload,
  uploadEnabled,
}: {
  cases: DemoCase[];
  loading: boolean;
  selectedId: string | null;
  busyId: string | null;
  onSelect: (c: DemoCase) => void;
  onUpload: (f: File) => void;
  uploadEnabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col border border-rule bg-sheet">
      <header className="border-b-2 border-rule-hard px-4 py-4">
        <div className="field">Case index</div>
        <h2 className="mt-1.5 font-display text-[1.0625rem] font-semibold tracking-[-0.011em] text-ink">
          {loading ? "Loading…" : `${cases.length} prepared cases`}
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-[52px] w-full" />
            ))}
          </div>
        ) : (
          <ol>
            {cases.map((c, i) => {
              const active = c.id === selectedId;
              const ink = VERDICT_INK[c.preview.verdict];
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c)}
                    aria-current={active}
                    className={`grid w-full cursor-pointer grid-cols-[1.5rem_2rem_minmax(0,1fr)] items-center gap-2.5 border-b border-rule px-3 py-2.5 text-left transition-colors ${
                      active ? "bg-sheet-2" : "hover:bg-sheet-2/70"
                    }`}
                    style={active ? { boxShadow: "inset 3px 0 0 0 var(--color-ink)" } : undefined}
                  >
                    <span className="seq">{String(i + 1).padStart(2, "0")}</span>
                    <img
                      src={c.image_url}
                      alt=""
                      width={32}
                      height={32}
                      loading="lazy"
                      className="h-8 w-8 shrink-0 bg-plate object-cover"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-display text-[0.8rem] font-medium text-ink">
                        {c.title}
                      </span>
                      <span className="num mt-0.5 flex items-center gap-1.5 text-[0.62rem] text-faint">
                        <span style={{ color: ink }}>
                          {VERDICT_GLYPH[c.preview.verdict]} {c.preview.verdict}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{(c.preview.confidence * 100).toFixed(0)}% conf</span>
                        {busyId === c.id && (
                          <span className="pulse-soft ml-auto h-1.5 w-1.5 rounded-full bg-plot" />
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="border-t-2 border-rule-hard p-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (uploadEnabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f && uploadEnabled) onUpload(f);
          }}
          className="border border-dashed px-3 py-3.5 text-center transition-colors"
          style={{
            borderColor: dragging ? "var(--color-plot)" : "var(--color-rule)",
            background: dragging ? "color-mix(in oklab, var(--color-plot) 6%, transparent)" : undefined,
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={!uploadEnabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={!uploadEnabled}
            className="cursor-pointer font-display text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-plot disabled:cursor-not-allowed disabled:text-faint"
          >
            Submit your own image
          </button>
          <p className="mt-1.5 text-[0.65rem] leading-relaxed text-faint">
            {uploadEnabled
              ? "Processed in this process. Nothing leaves the machine."
              : "Unavailable — model weights are not loaded."}
          </p>
        </div>
      </div>
    </div>
  );
}
