import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { CaseDeck } from "../components/CaseDeck";
import { EvidenceLedger } from "../components/EvidenceLedger";
import { Specimen } from "../components/Specimen";
import { StabilitySweep } from "../components/StabilitySweep";
import { CheckpointVote, EmbeddingDistance } from "../components/Signals";
import { VerdictPanel } from "../components/VerdictPanel";
import { EmptyState, ErrorState, Skeleton } from "../components/ui";
import type { AnalysisResponse, DemoCase, Health } from "../types";

export function AnalyzeView({ health }: { health: Health | null }) {
  const [cases, setCases] = useState<DemoCase[]>([]);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [deckLoading, setDeckLoading] = useState(true);

  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const runDemo = useCallback(async (c: DemoCase) => {
    setSelectedId(c.id);
    setBusyId(c.id);
    setAnalyzing(true);
    setError(null);
    try {
      setAnalysis(await api.analyzeDemo(c.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
      setAnalyzing(false);
    }
  }, []);

  const loadDeck = useCallback(async () => {
    setDeckLoading(true);
    setDeckError(null);
    try {
      const { cases } = await api.demoCases();
      setCases(cases);
      if (cases.length) void runDemo(cases[0]);
    } catch (e) {
      setDeckError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeckLoading(false);
    }
  }, [runDemo]);

  useEffect(() => {
    void loadDeck();
  }, [loadDeck]);

  const runUpload = useCallback(async (file: File) => {
    setSelectedId(null);
    setAnalyzing(true);
    setError(null);
    try {
      setAnalysis(await api.analyzeUpload(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-[1560px] px-5 py-5">
      <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-[104px] lg:h-[calc(100vh-124px)]">
          {deckError ? (
            <ErrorState
              title="Could not load the case deck"
              detail={deckError}
              onRetry={() => void loadDeck()}
            />
          ) : (
            <CaseDeck
              cases={cases}
              loading={deckLoading}
              selectedId={selectedId}
              busyId={busyId}
              onSelect={(c) => void runDemo(c)}
              onUpload={(f) => void runUpload(f)}
              uploadEnabled={health?.live_inference ?? false}
            />
          )}
        </aside>

        <main className="min-w-0 space-y-4">
          {error && (
            <ErrorState
              title="Analysis failed"
              detail={error}
              onRetry={
                selectedId
                  ? () => {
                      const c = cases.find((x) => x.id === selectedId);
                      if (c) void runDemo(c);
                    }
                  : undefined
              }
            />
          )}

          {analyzing && !analysis && <AnalyzeSkeleton />}

          {!analyzing && !analysis && !error && (
            <EmptyState
              title="No case selected"
              detail="Pick a prepared case from the deck, or drop in your own image to run the full battery against it."
            />
          )}

          {analysis && (
            <div
              key={analysis.title + analysis.elapsed_ms}
              className={`space-y-4 rise ${analyzing ? "opacity-50 transition-opacity" : ""}`}
            >
              <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
                <Specimen analysis={analysis} />
                <VerdictPanel result={analysis.result} />
              </div>

              <StabilitySweep result={analysis.result} />

              <div className="grid gap-4 lg:grid-cols-2">
                <CheckpointVote result={analysis.result} />
                <EmbeddingDistance result={analysis.result} />
              </div>

              <EvidenceLedger evidence={analysis.result.evidence} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function AnalyzeSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Running the reliability battery">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Skeleton className="h-[460px]" />
        <Skeleton className="h-[460px]" />
      </div>
      <Skeleton className="h-[230px]" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[250px]" />
        <Skeleton className="h-[250px]" />
      </div>
    </div>
  );
}
