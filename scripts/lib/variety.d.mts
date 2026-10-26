export interface VarietyCheck {
  id: string;
  label: string;
  value: string;
  pass: boolean;
  target: string;
}

export interface VarietySummary {
  distinctCourseSignatures: number;
  arenaPlans: string[];
  fShows: number;
  gShows: number;
  idleQualified: number;
  casualQualified: number;
  livingWinners: number;
  touchedWinners: number;
  noWinnerRuns: number;
  totalMedian: number;
  minTotal: number;
  maxTotal: number;
}

export interface VarietyEvaluation {
  checks: VarietyCheck[];
  pass: boolean;
  failed: string[];
  plans: Array<{
    seed: number;
    courseSignature: string;
    routeLabel: string;
    arena: string;
    arenaLabel: string;
    signature: string;
  }>;
  rows: Array<Record<string, unknown>>;
  summary: VarietySummary;
}

export const VARIETY_TARGETS: Readonly<Record<string, number>>;

export function evaluateVariety(
  idleRuns: readonly unknown[],
  casualRuns: readonly unknown[],
): VarietyEvaluation;

export function varietyRows(
  idleRuns: readonly unknown[],
  casualRuns: readonly unknown[],
): Array<Record<string, unknown>>;

export function formatVarietyReport(evaluation: VarietyEvaluation): string;
