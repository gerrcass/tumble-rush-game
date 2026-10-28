export interface TwistCheck {
  id: string;
  label: string;
  value: string;
  pass: boolean;
  target: string;
}

export interface TwistRunTotals {
  seeds: number[];
  twistCounts: Record<string, number>;
  idleQualified: number;
  casualQualified: number;
  casualTarget: number;
  livingWinners: number;
  touchedWinners: number;
  livingTarget: number;
  totalMedian: number;
  minTotal: number;
  maxTotal: number;
  courseMedian: number;
  courseMin: number;
  courseMax: number;
  hexMedian: number;
  hexMin: number;
  hexMax: number;
  crownMin: number;
  crownMax: number;
  byTwist: Record<
    string,
    {
      seeds: number[];
      runs: number;
      courseMedian: number;
      courseMin: number;
      courseMax: number;
      hexMedian: number;
      hexMin: number;
      hexMax: number;
      finishersMin: number;
      sugarRushReached: number;
      casualQualified: number;
    }
  >;
}

export interface TwistEvaluation {
  checks: TwistCheck[];
  pass: boolean;
  failed: string[];
  issues: string[];
  summary: TwistRunTotals;
  rows: Array<Record<string, unknown>>;
}

export const TWIST_IDS: readonly string[];
export const TWIST_TARGETS: Readonly<Record<string, number>>;
export const CLASSIC_GRAVITY: number;
export const TWIST_TUNING: Readonly<
  Record<string, Readonly<Record<string, number>>>
>;
export function unapplyRuns(runs: readonly unknown[]): unknown[];
export function evaluateTwists(
  idleRuns: readonly unknown[],
  casualRuns: readonly unknown[],
): TwistEvaluation;
export function formatTwistReport(evaluation: TwistEvaluation): string;
