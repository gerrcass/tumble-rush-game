import { describe, expect, it } from 'vitest';
import { evaluateVariety, VARIETY_TARGETS } from '../../scripts/lib/variety.mjs';
import { planShow } from '../game/levels/coursePlan';

const SEEDS = Array.from({ length: 12 }, (_, index) => (20260418 + index * 104729) >>> 0);

function round(mode: string, picks: Record<string, number>) {
  return {
    mode,
    seconds: picks.seconds ?? 60,
    finishers: picks.finishers ?? 8,
    playerQualified: Boolean(picks.playerQualified),
    sugarRushReached: picks.sugarRush ?? true,
    livingWinner: picks.living ?? true,
    winnerTouchedCrown: picks.touched ?? true,
  };
}

function run(seed: number, plan: ReturnType<typeof planShow>, mode: 'idle' | 'casual', overrides: Record<string, number> = {}) {
  const personal = { playerQualified: mode === 'casual' ? 1 : 0, ...overrides };
  return {
    seed,
    mode,
    plan,
    totalSeconds: overrides.total ?? 210,
    rounds: [
      round('course', { seconds: 70, finishers: 8, ...personal }),
      round('hexapop', { seconds: 47, ...personal }),
      round('crown-climb', { seconds: 55, ...personal }),
    ],
  };
}

function validSweep() {
  const plans = SEEDS.map((seed) => planShow(seed));
  const idle = plans.map((plan, index) => run(SEEDS[index]!, plan, 'idle'));
  const casual = plans.map((plan, index) => run(SEEDS[index]!, plan, 'casual'));
  return { idle, casual };
}

describe('M3 variety gate', () => {
  it('passes the real 12-seed plan deck', () => {
    const { idle, casual } = validSweep();
    const evaluation = evaluateVariety(idle, casual);
    expect(evaluation.pass, evaluation.failed.join(', ')).toBe(true);
    expect(evaluation.summary.distinctCourseSignatures).toBeGreaterThanOrEqual(
      VARIETY_TARGETS.distinctCourseSignatures,
    );
    expect(evaluation.summary.arenaPlans).toHaveLength(3);
    expect(evaluation.summary.fShows).toBeGreaterThanOrEqual(4);
    expect(evaluation.summary.gShows).toBeGreaterThanOrEqual(4);
  });

  it('fails a deliberately collapsed route deck (negative control)', () => {
    const { idle, casual } = validSweep();
    const collapsed = idle.map((entry) => ({
      ...entry,
      plan: {
        ...entry.plan,
        courseSignature: 'B-C-D/B-C-D',
        lapRoutes: [['B', 'C', 'D'], ['B', 'C', 'D']],
        routeLabel: 'B-C-D / B-C-D',
        arena: 'rings',
        arenaLabel: 'RINGS',
        signature: 'B-C-D/B-C-D · RINGS',
      },
    }));
    const evaluation = evaluateVariety(collapsed, casual);
    expect(evaluation.pass).toBe(false);
    expect(evaluation.failed).toContain('distinct-routes');
    expect(evaluation.failed).toContain('arena-variety');
    expect(evaluation.failed).toContain('new-section-f');
    expect(evaluation.failed).toContain('new-section-g');
  });

  it('fails a broken pacing run and an idle qualifier', () => {
    const { idle, casual } = validSweep();
    const broken = idle.map((entry, index) =>
      index === 0
        ? {
            ...entry,
            rounds: entry.rounds.map((value) =>
              value.mode === 'course'
                ? { ...value, seconds: 20, finishers: 3, playerQualified: true }
                : value,
            ),
          }
        : entry,
    );
    const evaluation = evaluateVariety(broken, casual);
    expect(evaluation.pass).toBe(false);
    expect(evaluation.failed).toContain('course-bands');
    expect(evaluation.failed).toContain('idle-human');
  });
});
