import { useEffect, useState } from "react";
import { api } from "./api";
import { Header, type View } from "./components/Header";
import { AnalyzeView } from "./views/AnalyzeView";
import { AuditView } from "./views/AuditView";
import type { Health } from "./types";

export default function App() {
  const [view, setView] = useState<View>("analyze");
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <div className="min-h-screen">
      <Header view={view} onView={setView} health={health} />
      {view === "analyze" ? <AnalyzeView health={health} /> : <AuditView />}
    </div>
  );
}
