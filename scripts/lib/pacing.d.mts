export interface PacingBands {
  courseMinSeconds: number;
  courseMaxSeconds: number;
  courseMinFinishers: number;
  hexMinSeconds: number;
  hexMaxSeconds: number;
  crownMinSeconds: number;
  crownMaxSeconds: number;
  crownLivingWinnerRate: number;
  casualQualifyRate: number;
  showTargetMinSeconds: number;
  showTargetMaxSeconds: number;
  showFloorSeconds: number;
  showCeilingSeconds: number;
}

export interface PacingStats {
  count: number;
  median: number;
  min: number;
  max: number;
}

export interface PacingSummary {
  runs: number;
  casualRuns: number;
  seeds: number[];
  total: PacingStats;
  roundSeconds: PacingStats;
  course: PacingStats & { finishers: PacingStats; qualifiers: PacingStats };
  hexapop: PacingStats;
  crown: PacingStats & { livingWinners: number; livingWinnerRate: number };
  idleQualified: number;
  casualQualified: number;
  casualRate: number;
}

export interface PacingCheck {
  id: string;
  label: string;
  value: string;
  pass: boolean;
  pending: boolean;
  target: string;
  detail: string;
}

export interface PacingEvaluation {
  phase: string;
  checks: PacingCheck[];
  pass: boolean;
  failed: string[];
  pending: string[];
}

export const PACING_BANDS: PacingBands;
export const SWEEP_STRIDE: number;
export function sweepSeeds(baseSeed: number, runs: number): number[];
export function median(values: readonly number[]): number;
export function stats(values: readonly number[]): PacingStats;
export function round2(value: number): number;
export function summarize(
  idleRuns: readonly unknown[],
  casualRuns: readonly unknown[],
): PacingSummary;
export function evaluatePacing(
  summary: PacingSummary,
  options?: { phase?: string },
): PacingEvaluation;
export function formatReport(summary: PacingSummary, evaluation: PacingEvaluation): string;
