import type { AnalysisResponse, Audit, DemoCase, Health, ShiftStudy } from "./types";

/** Everything is same-origin: the Vite dev server proxies /api to the FastAPI
 *  process, and the production build is served by that same process. No
 *  external host is contacted at any point in the demo path. */
async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(await message(res));
  return res.json() as Promise<T>;
}

async function message(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    /* fall through to the status line */
  }
  return `Request failed (${res.status} ${res.statusText}).`;
}

export const api = {
  health: () => get<Health>("/api/health"),
  demoCases: () => get<{ cases: DemoCase[]; disclaimer: string }>("/api/demo-cases"),
  audit: () => get<Audit>("/api/audit"),
  shift: () => get<ShiftStudy>("/api/shift"),

  analyzeDemo: async (id: string): Promise<AnalysisResponse> => {
    const res = await fetch(`/api/analyze/demo/${encodeURIComponent(id)}`, { method: "POST" });
    if (!res.ok) throw new Error(await message(res));
    return res.json();
  },

  analyzeUpload: async (file: File): Promise<AnalysisResponse> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/analyze", { method: "POST", body: form });
    if (!res.ok) throw new Error(await message(res));
    return res.json();
  },
};
