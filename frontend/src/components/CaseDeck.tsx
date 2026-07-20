import { useRef, useState } from "react";
import type { DemoCase } from "../types";
import { Skeleton, VERDICT_COLOR, VERDICT_GLYPH } from "./ui";

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
    <div className="flex h-full min-h-0 flex-col border border-rule-soft bg-panel" style={{ borderRadius: 3 }}>
      <header className="border-b border-rule-soft px-4 py-3.5">
        <div className="eyebrow">Case deck</div>
        <h2 className="mt-1.5 font-display text-[0.95rem] font-medium tracking-tight text-bone">
          {loading ? "Loading…" : `${cases.length} prepared cases`}
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[68px] w-full" />
            ))}
          </div>
        ) : (
          <ul className="space-y-1">
            {cases.map((c) => {
              const active = c.id === selectedId;
              const vc = VERDICT_COLOR[c.preview.verdict];
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c)}
                    aria-current={active}
                    className={`flex w-full cursor-pointer items-center gap-3 px-2.5 py-2.5 text-left transition-colors ${
                      active ? "bg-panel-2" : "hover:bg-panel-2/60"
                    }`}
                    style={{
                      borderRadius: 2,
                      boxShadow: active ? `inset 2px 0 0 0 ${vc}` : undefined,
                    }}
                  >
                    <img
                      src={c.image_url}
                      alt=""
                      width={40}
                      height={40}
                      loading="lazy"
                      className="h-10 w-10 shrink-0 object-cover"
                      style={{ borderRadius: 2, filter: "contrast(1.05)" }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[0.78rem] font-medium text-bone">
                        {c.title}
                      </span>
                      <span className="num mt-1 flex items-center gap-1.5 text-[0.62rem]">
                        <span style={{ color: vc }}>
                          {VERDICT_GLYPH[c.preview.verdict]} {c.preview.verdict}
                        </span>
                        <span className="text-faint">·</span>
                        <span className="text-faint">
                          {c.preview.reliability_score.toFixed(0)}
                        </span>
                        <span className="text-faint">·</span>
                        <span className="truncate text-faint">
                          {(c.preview.confidence * 100).toFixed(0)}% conf
                        </span>
                      </span>
                    </span>
                    {busyId === c.id && (
                      <span className="pulse-soft h-1.5 w-1.5 shrink-0 rounded-full bg-instrument" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-rule-soft p-3">
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
          className="border border-dashed px-3 py-4 text-center transition-colors"
          style={{
            borderRadius: 2,
            borderColor: dragging ? "var(--color-instrument)" : "var(--color-rule)",
            background: dragging ? "color-mix(in oklab, var(--color-instrument) 8%, transparent)" : undefined,
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
            className="cursor-pointer font-mono text-[0.68rem] uppercase tracking-[0.12em] text-instrument disabled:cursor-not-allowed disabled:text-faint"
          >
            Test your own image
          </button>
          <p className="mt-1.5 text-[0.65rem] leading-relaxed text-faint">
            {uploadEnabled
              ? "Drop a file or browse. Processed in this process; nothing leaves the machine."
              : "Unavailable — model weights are not loaded."}
          </p>
        </div>
      </div>
    </div>
  );
}
