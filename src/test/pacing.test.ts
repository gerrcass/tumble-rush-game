import { describe, expect, it } from 'vitest';
import {
  PACING_BANDS,
  evaluatePacing,
  median,
  stats,
  summarize,
  sweepSeeds,
} from '../../scripts/lib/pacing.mjs';
import {
  CASUAL_COURSE_OPTIONS,
  COURSE_SPEED_MAX,
  COURSE_SPEED_MIN,
  courseBotSpeed,
  humanPaceAnchor,
} from '../game/bots/BotBrain';

function round(mode: string, seconds: number, extra: Record<string, unknown> = {}) {
  return {
    mode,
    seconds,
    finishers: 8,
    qualified: 8,
    playerQualified: false,
    playerStatus: 'ELIMINATED',
    livingWinner: mode === 'crown-climb',
    winnerTouchedCrown: mode === 'crown-climb',
    winnerHeight: mode === 'crown-climb' ? 48.4 : null,
    winnerDistanceToCrown: mode === 'crown-climb' ? 0 : null,
    winnerFinishTime: mode === 'crown-climb' ? 55 : null,
    winnerEliminated: mode === 'crown-climb' ? false : null,
    ...extra,
  };
}

function run(seed: number, courseSeconds = 72, casualQualified = true) {
  return {
    seed,
    totalSeconds: 200,
    roundSeconds: courseSeconds + 40 + 55,
    rounds: [
      round('course', courseSeconds),
      round('hexapop', 40),
      round('crown-climb', 55),
    ],
    casualCourse: casualQualified,
  };
}

/** The summary shape the evaluator needs, with optional overrides. */
function summary(overrides: Record<string, unknown> = {}) {
  const idle = Array.from({ length: 10 }, (_, index) => run(index));
  const casual = Array.from({ length: 10 }, (_, index) =>
    run(index, 72, index < 7),
  ).map((entry) => ({
    ...entry,
    rounds: [round('course', 72, { playerQualified: entry.casualCourse }), ...entry.rounds.slice(1)],
  }));
  const base = summarize(idle, casual);
  return { ...base, ...overrides };
}

describe('pace bands', () => {
  it('computes a stable median for odd, even and empty samples', () => {
    expect(median([90, 45, 60])).toBe(60);
    expect(median([10, 30, 20, 40])).toBe(25);
    expect(median([])).toBe(0);
    expect(stats([1, 2, 3])).toEqual({ count: 3, median: 2, min: 1, max: 3 });
  });

  it('builds a deterministic 10-seed sweep starting from the baseline seed', () => {
    const seeds = sweepSeeds(20260418, 10);
    expect(seeds).toHaveLength(10);
    expect(seeds[0]).toBe(20260418);
    expect(new Set(seeds).size).toBe(10);
    expect(sweepSeeds(20260418, 10)).toEqual(seeds);
    expect(seeds[1]).not.toBe(seeds[0]);
  });

  it('passes a 45–90 s Course, 8+ finishers, 0 idle qualifiers and 7/10 casual', () => {
    const evaluation = evaluatePacing(summary(), { phase: 'a' });
    expect(evaluation.pass).toBe(true);
    expect(evaluation.failed).toEqual([]);
    expect(evaluation.pending).toContain('hexapop-clock');
    expect(evaluation.pending).toContain('crown-living-winner');
  });

  it('fails a 26 s Course metronome and a 7-finisher pack', () => {
    const data = summary();
    data.course = {
      ...data.course,
      min: 26,
      max: 26,
      median: 26,
      finishers: { count: 10, median: 7, min: 7, max: 7 },
    };
    const evaluation = evaluatePacing(data, { phase: 'a' });
    expect(evaluation.pass).toBe(false);
    expect(evaluation.failed).toContain('course-clock');
    expect(evaluation.failed).toContain('course-finishers');
  });

  it('fails when an idle human qualifies or casual falls below 7/10', () => {
    const data = summary({ idleQualified: 1, casualQualified: 6, casualRate: 0.6 });
    const evaluation = evaluatePacing(data, { phase: 'a' });
    expect(evaluation.pass).toBe(false);
    expect(evaluation.failed).toContain('idle-never-qualifies');
    expect(evaluation.failed).toContain('casual-qualifies');
  });

  it('makes the Phase B placeholders hard when asked', () => {
    const data = summary();
    data.hexapop = {
      count: 20,
      median: 6,
      min: 6,
      max: 6,
      idle: { count: 10, median: 6, min: 6, max: 6 },
      casual: { count: 10, median: 6, min: 6, max: 6 },
      sugarRushReached: 0,
      sugarRushRate: 0,
    };
    const phaseA = evaluatePacing(data, { phase: 'a' });
    expect(phaseA.pass).toBe(true);
    const phaseB = evaluatePacing(data, { phase: 'b' });
    expect(phaseB.pending).toEqual([]);
    expect(phaseB.pass).toBe(false);
    expect(phaseB.failed).toContain('hexapop-clock');
  });

  it('keeps the documented M2 bands in one frozen table', () => {
    expect(PACING_BANDS.courseMinSeconds).toBe(45);
    expect(PACING_BANDS.courseMaxSeconds).toBe(90);
    expect(PACING_BANDS.courseMinFinishers).toBe(8);
    expect(PACING_BANDS.hexMinSeconds).toBe(30);
    expect(PACING_BANDS.hexMaxSeconds).toBe(50);
    expect(PACING_BANDS.crownMinSeconds).toBe(45);
    expect(PACING_BANDS.crownMaxSeconds).toBe(80);
    expect(PACING_BANDS.crownLivingWinnerRate).toBe(0.95);
    expect(PACING_BANDS.casualQualifyRate).toBe(0.7);
    expect(Object.isFrozen(PACING_BANDS)).toBe(true);
  });
});

describe('Course bot pace and human anchor', () => {
  it('maps skill into the 0.62–0.78 target-speed band without exceeding it', () => {
    expect(courseBotSpeed(0)).toBeCloseTo(COURSE_SPEED_MIN, 6);
    expect(courseBotSpeed(1)).toBeCloseTo(COURSE_SPEED_MAX, 6);
    expect(courseBotSpeed(0.5)).toBeGreaterThan(COURSE_SPEED_MIN);
    expect(courseBotSpeed(0.5)).toBeLessThan(COURSE_SPEED_MAX);
    expect(courseBotSpeed(-3)).toBeCloseTo(COURSE_SPEED_MIN, 6);
    expect(courseBotSpeed(9)).toBeCloseTo(COURSE_SPEED_MAX, 6);
    for (let skill = 0; skill <= 1; skill += 0.1) {
      expect(courseBotSpeed(skill)).toBeGreaterThanOrEqual(0.62);
      expect(courseBotSpeed(skill)).toBeLessThanOrEqual(0.78);
    }
  });

  it('keeps the scripted casual pilot below the bot band top and the player cap', () => {
    expect(CASUAL_COURSE_OPTIONS.speedScale).toBeDefined();
    const casualCruise = COURSE_SPEED_MAX * CASUAL_COURSE_OPTIONS.speedScale!;
    expect(casualCruise).toBeGreaterThanOrEqual(0.71);
    expect(casualCruise).toBeLessThanOrEqual(0.73);
    expect(casualCruise).toBeLessThan(COURSE_SPEED_MAX);
    expect(CASUAL_COURSE_OPTIONS.reactionBonus!).toBeGreaterThan(0.14);
    expect(CASUAL_COURSE_OPTIONS.hazardRadius!).toBeLessThan(2.35);
    expect(CASUAL_COURSE_OPTIONS.baseMistake!).toBeGreaterThan(0);
  });

  it('only slows bots after the human is more than 25% behind', () => {
    expect(humanPaceAnchor(0.5, 0.75, 'course')).toBe(1);
    expect(humanPaceAnchor(0.5, 0.7501, 'course')).toBeCloseTo(1, 3);
    expect(humanPaceAnchor(0.4, 0.7, 'course')).toBeCloseTo(0.98, 6);
    expect(humanPaceAnchor(0.02, 0.52, 'course')).toBeCloseTo(0.9, 6);
    // An idle human (no progress) never slows the pack.
    expect(humanPaceAnchor(0, 1, 'course')).toBe(1);
    // Never speeds a bot up, and never applies outside the Course final.
    expect(humanPaceAnchor(0.9, 0.1, 'course')).toBe(1);
    expect(humanPaceAnchor(0, 1, 'crown-climb')).toBe(1);
    expect(humanPaceAnchor(null, 1, 'course')).toBe(1);
    expect(humanPaceAnchor(undefined, 1, 'course')).toBe(1);
  });
});
