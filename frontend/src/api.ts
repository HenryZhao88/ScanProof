import type { AnalysisResponse, Audit, DemoCase, Health, ShiftStudy } from "./types";

const STATIC_BASE = "/generated";
const DISCLAIMER =
  "Research prototype — not for diagnosis, not a medical device, no clinical validation. ScanProof runs four independent checks on a chest X-ray classifier's prediction and withholds it when they disagree. PASS is not a claim that a prediction is correct or clinically safe.";

type DemoManifestCase = {
  id: string;
  title: string;
  why_included: string;
  image: string;
  source: string;
  true_class: string;
  license: string;
  cached_result: AnalysisResponse["result"];
};

type DemoManifest = {
  cases: DemoManifestCase[];
};

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

async function getLive<T>(path: string): Promise<T> {
  return get<T>(path);
}

async function getStatic<T>(path: string): Promise<T> {
  return get<T>(`${STATIC_BASE}${path}`);
}

async function loadDemoManifest(): Promise<DemoManifest> {
  return getStatic<DemoManifest>("/manifest.json");
}

async function loadAudit(): Promise<Audit> {
  return getStatic<Audit>("/audit_summary.json");
}

async function loadShift(): Promise<ShiftStudy> {
  return getStatic<ShiftStudy>("/shift_study.json");
}

function toDemoCase(caseData: DemoManifestCase): DemoCase {
  return {
    id: caseData.id,
    title: caseData.title,
    why_included: caseData.why_included,
    source: caseData.source,
    true_class: caseData.true_class,
    license: caseData.license,
    image_url: `${STATIC_BASE}/demo-cases/${caseData.image}`,
    preview: {
      verdict: caseData.cached_result.verdict,
      predicted_class: caseData.cached_result.predicted_class,
      confidence: caseData.cached_result.confidence,
      reliability_score: caseData.cached_result.reliability_score,
    },
  };
}

export const api = {
  health: async (): Promise<Health> => {
    try {
      return await getLive<Health>("/api/health");
    } catch {
      const { cases } = await loadDemoManifest();
      return {
        status: "ok",
        live_inference: false,
        load_error: "Static Vercel deployment",
        demo_cases: cases.length,
        audit_available: true,
        disclaimer: DISCLAIMER,
      };
    }
  },
  demoCases: async (): Promise<{ cases: DemoCase[]; disclaimer: string }> => {
    try {
      return await getLive<{ cases: DemoCase[]; disclaimer: string }>("/api/demo-cases");
    } catch {
      const manifest = await loadDemoManifest();
      return { cases: manifest.cases.map(toDemoCase), disclaimer: DISCLAIMER };
    }
  },
  audit: async (): Promise<Audit> => {
    try {
      return await getLive<Audit>("/api/audit");
    } catch {
      return loadAudit();
    }
  },
  shift: async (): Promise<ShiftStudy> => {
    try {
      return await getLive<ShiftStudy>("/api/shift");
    } catch {
      return loadShift();
    }
  },

  analyzeDemo: async (id: string): Promise<AnalysisResponse> => {
    try {
      const res = await fetch(`/api/analyze/demo/${encodeURIComponent(id)}`, { method: "POST" });
      if (!res.ok) throw new Error(await message(res));
      return res.json();
    } catch {
      const { cases } = await loadDemoManifest();
      const caseData = cases.find((c) => c.id === id);
      if (!caseData) {
        throw new Error(`Unknown demo case ${id}.`);
      }

      return {
        case_id: caseData.id,
        title: caseData.title,
        why_included: caseData.why_included,
        source: caseData.source,
        true_class: caseData.true_class,
        license: caseData.license,
        image_url: `${STATIC_BASE}/demo-cases/${caseData.image}`,
        live: false,
        note: "Served from static demo artifacts on Vercel.",
        elapsed_ms: 0,
        result: caseData.cached_result,
        disclaimer: DISCLAIMER,
      };
    }
  },

  analyzeUpload: async (file: File): Promise<AnalysisResponse> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/analyze", { method: "POST", body: form });
    if (!res.ok) throw new Error(await message(res));
    return res.json();
  },
};
