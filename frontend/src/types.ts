export type Verdict = "PASS" | "REVIEW" | "BLOCK";
export type EvidenceLevel = "critical" | "warning" | "ok";

export interface SubScore {
  key: string;
  label: string;
  value: number;
  weight: number;
  points: number;
  max_points: number;
  detail: string;
}

export interface Evidence {
  level: EvidenceLevel;
  source: string;
  title: string;
  detail: string;
}

export interface PerturbationRow {
  family: string;
  family_label: string;
  severity: number;
  magnitude: string;
  prob_pneumonia: number;
  prob_predicted: number;
  delta: number;
  flipped: boolean;
  predicted_class: string;
}

export interface ReliabilityResult {
  predicted_class: string;
  predicted_index: number;
  confidence: number;
  prob_pneumonia: number;
  reliability_score: number;
  verdict: Verdict;
  subscores: SubScore[];
  evidence: Evidence[];
  gates: string[];
  perturbation_table: PerturbationRow[];
  perturbation_summary: {
    n_variants: number;
    n_flips: number;
    flip_rate: number;
    mean_abs_delta: number;
    max_abs_delta: number;
    by_family: { family: string; family_label: string; flips: number; max_abs_delta: number }[];
  };
  ensemble: {
    members: { name: string; prob_pneumonia: number; predicted_class: string }[];
    std: number;
    unanimous: boolean;
  };
  ood: {
    distance: number;
    percentile: number;
    hard_gate_percentile: number;
    soft_gate_percentile: number;
  };
  thresholds: { pass: number; review: number; source: string };
}

export interface AnalysisResponse {
  case_id: string | null;
  title: string;
  why_included: string | null;
  source: string;
  true_class: string | null;
  license: string | null;
  image_url: string;
  live: boolean;
  note?: string;
  elapsed_ms: number;
  result: ReliabilityResult;
  disclaimer: string;
}

export interface DemoCase {
  id: string;
  title: string;
  why_included: string;
  source: string;
  true_class: string;
  license: string;
  image_url: string;
  preview: {
    verdict: Verdict;
    predicted_class: string;
    confidence: number;
    reliability_score: number;
  };
}

export interface Health {
  status: string;
  live_inference: boolean;
  load_error: string | null;
  demo_cases: number;
  audit_available: boolean;
  disclaimer: string;
}

export interface Bin {
  lower: number;
  upper: number;
  count: number;
  confidence: number | null;
  accuracy: number | null;
}

export interface BandRow {
  band: Verdict;
  n: number;
  coverage: number;
  accuracy: number | null;
  mean_reliability_score: number | null;
  mean_confidence: number | null;
  errors: number;
  share_of_all_errors: number;
  auroc?: number;
}

export interface SelectivePoint {
  coverage: number;
  accuracy: number;
  risk: number;
  n_retained: number;
}

export interface Audit {
  generated_by: string;
  generated_at_utc: string;
  dataset: {
    flag: string;
    python_class: string;
    description: string;
    license: string;
    n_samples: Record<string, number>;
    labels: Record<string, string>;
    source_url: string;
    md5: string;
  };
  model: {
    members: { name: string; arch: string; seed: number; augment: string; temperature: number }[];
    feature_member: string;
    device: string;
    thresholds: { pass: number; review: number; ood_hard_percentile: number; source: string };
    weights: Record<string, number>;
  };
  splits: Record<string, { split: string; n: number }>;
  classification: {
    test: ClassificationMetrics;
    validation: ClassificationMetrics;
    class_balance_test: Record<string, number>;
  };
  calibration: {
    note: string;
    ece_raw: number;
    ece_calibrated: number;
    brier_raw: number;
    brier_calibrated: number;
    nll_raw: number;
    nll_calibrated: number;
    reliability_diagram: { raw: Bin[]; calibrated: Bin[] };
  };
  reliability_bands: {
    thresholds: { pass: number; review: number; source: string };
    test: BandRow[];
    validation: BandRow[];
  };
  selective_prediction: {
    note: string;
    by_reliability_score: { points: SelectivePoint[]; aurc: number };
    by_confidence_only: { points: SelectivePoint[]; aurc: number };
  };
  robustness: {
    clean_accuracy: number;
    families: {
      family: string;
      family_label: string;
      description: string;
      severities: {
        severity: number;
        magnitude: string;
        accuracy: number;
        accuracy_drop: number;
        flip_rate: number;
      }[];
    }[];
  };
  ood: {
    method: string;
    feature_member: string;
    in_distribution: { source: string; n: number; mean_percentile: number; frac_above_hard_gate: number };
    out_of_distribution: { source: string; n: number; mean_percentile: number; frac_above_hard_gate: number };
    detection_auroc: number;
    hard_gate_percentile: number;
  };
  disclaimer: string;
}

export interface ClassificationMetrics {
  n: number;
  accuracy: number;
  balanced_accuracy: number;
  auroc: number;
  sensitivity: number;
  specificity: number;
  confusion: { tp: number; tn: number; fp: number; fn: number };
}
