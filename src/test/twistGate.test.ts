import { describe, expect, it } from 'vitest';
import {
  TWIST_TUNING,
  evaluateTwists,
  unapplyRuns,
} from '../../scripts/lib/twist-gate.mjs';
import { TWISTS, type TwistId } from '../game/twist';
import { planShow } from '../game/levels/coursePlan';

const SEEDS = Array.from({ length: 12 }, (_, index) => (20260418 + index * 104729) >>> 0);

function probe(seed: number, twist: TwistId, mode: string, sugarAt: number | null = null) {
  const plan = planShow(seed).twist;
  const rules = plan.rules;
  return {
    id: mode === 'crown-climb' ? 'classic' : twist,
    applied: true,
    classic: mode === 'crown-climb',
    gravity: mode === 'crown-climb' ? -26 : -26 * rules.gravityScale,
    frictionScale: mode === 'crown-climb' ? 1 : rules.frictionScale,
    hazardSpeedScale: mode === 'crown-climb' ? 1 : rules.hazardSpeedScale,
    sugarRushSeconds: mode === 'crown-climb' ? 45 : rules.hexSugarRush,
    sugarRushReached: mode === 'hexapop' ? sugarAt !== null : false,
    timeLimit:
      mode === 'crown-climb' ? 120 : mode === 'course' ? rules.courseTimeLimit : rules.hexTimeLimit,
    signVisible: mode !== 'crown-climb',
    signLabel: mode === 'crown-climb' ? '' : plan.label,
  };
}

function round(seed: number, mode: string, twist: TwistId, overrides: Record<string, number | null> = {}) {
  const seconds =
    overrides.seconds ?? (mode === 'course' ? 70 : mode === 'hexapop' ? 46 : 55);
  const rush = twist === 'rush';
  return {
    mode,
    seconds,
    finishers: overrides.finishers ?? 8,
    qualified: 4,
    playerQualified: Boolean(overrides.playerQualified),
    livingWinner: mode === 'crown-climb',
    winnerTouchedCrown: mode === 'crown-climb',
    sugarRushReached: mode === 'hexapop',
    sugarRushAt: mode === 'hexapop' ? (overrides.sugarRushAt ?? (rush ? 38 : 45)) : null,
    twist: probe(seed, twist, mode, mode === 'hexapop' ? (rush ? 38 : 45) : null),
    winner: mode === 'crown-climb' ? 'Bot' : null,
  };
}

function run(seed: number, mode: 'idle' | 'casual', overrides: Record<string, number> = {}) {
  const plan = planShow(seed);
  return {
    seed,
    mode,
    plan: {
      ...plan,
      twist: {
        id: plan.twist.id,
        label: plan.twist.label,
        short: plan.twist.short,
        rule: plan.twist.blurb,
      },
    },
    totalSeconds: overrides.total ?? 205,
    rounds: [
      round(seed, 'course', plan.twist.id, {
        seconds: overrides.course,
        finishers: overrides.finishers,
        playerQualified: mode === 'casual' ? 1 : 0,
      }),
      round(seed, 'hexapop', plan.twist.id, { seconds: overrides.hex, sugarRushAt: overrides.sugarRushAt }),
      round(seed, 'crown-climb', plan.twist.id, { seconds: overrides.crown }),
    ],
  };
}

function validSweep() {
  return {
    idle: SEEDS.map((seed) => run(seed, 'idle')),
    casual: SEEDS.map((seed) => run(seed, 'casual')),
  };
}

describe('M4 twist gate', () => {
  it('passes the real 12-seed deck and rejects a relabelled applied:false deck', () => {
    const { idle, casual } = validSweep();
    const evaluation = evaluateTwists(idle, casual);
    expect(evaluation.pass, evaluation.failed.join(', ')).toBe(true);
    expect(evaluation.summary.twistCounts).toEqual({ moon: 6, slippery: 3, rush: 3 });
    expect(evaluation.summary.livingWinners).toBe(24);

    const negative = evaluateTwists(unapplyRuns(idle), unapplyRuns(casual));
    expect(negative.pass).toBe(false);
    expect(negative.failed).toContain('applied-probe');
  });

  it('rejects a plan that claims moon but leaves classic gravity installed', () => {
    const { idle, casual } = validSweep();
    const moonIdle = idle.map((entry) =>
      entry.plan.twist.id === 'moon'
        ? {
            ...entry,
            rounds: entry.rounds.map((value) =>
              value.mode === 'course'
                ? { ...value, twist: { ...value.twist, gravity: -26 } }
                : value,
            ),
          }
        : entry,
    );
    const evaluation = evaluateTwists(moonIdle, casual);
    expect(evaluation.pass).toBe(false);
    expect(evaluation.failed).toContain('applied-probe');
    expect(evaluation.issues.some((issue: string) => issue.includes('gravity'))).toBe(true);
  });

  it('rejects a twist that never appears and a broken M2 band', () => {
    const { idle, casual } = validSweep();
    const collapsed = idle.map((entry) => ({
      ...entry,
      plan: { ...entry.plan, twist: { ...entry.plan.twist, id: 'moon', short: 'MOON' } },
      rounds: entry.rounds.map((value) => ({
        ...value,
        twist: { ...value.twist, id: value.mode === 'crown-climb' ? 'classic' : 'moon' },
      })),
    }));
    const noVariety = evaluateTwists(collapsed, casual);
    expect(noVariety.pass).toBe(false);
    expect(noVariety.failed).toContain('twist-coverage');

    const slow = idle.map((entry, index) =>
      index === 0 ? run(entry.seed, 'idle', { course: 100, finishers: 3 }) : entry,
    );
    const broken = evaluateTwists(slow, casual);
    expect(broken.pass).toBe(false);
    expect(broken.failed).toContain('course-bands');
  });

  it('rejects a deck with a missing Round instead of passing an empty band', () => {
    const { idle, casual } = validSweep();
    const missingCrown = idle.map((entry, index) =>
      index === 0
        ? {
            ...entry,
            rounds: entry.rounds.filter((round) => round.mode !== 'crown-climb'),
          }
        : entry,
    );
    const evaluation = evaluateTwists(missingCrown, casual);
    expect(evaluation.pass).toBe(false);
    expect(evaluation.failed).toContain('round-coverage');
    expect(evaluation.failed).toContain('crown-bands');
    expect(evaluation.missingRounds).toContain('idle seed=20260418 crown-climb');
  });

  it('rejects a RUSH plan that left the Course hazards at classic speed', () => {
    const { idle, casual } = validSweep();
    const lying = idle.map((entry) =>
      entry.plan.twist.id === 'rush'
        ? {
            ...entry,
            rounds: entry.rounds.map((value) =>
              value.mode === 'course'
                ? { ...value, twist: { ...value.twist, hazardSpeedScale: 1 } }
                : value,
            ),
          }
        : entry,
    );
    const evaluation = evaluateTwists(lying, casual);
    expect(evaluation.pass).toBe(false);
    expect(evaluation.failed).toContain('applied-probe');
    expect(evaluation.issues.some((issue: string) => issue.includes('hazard scale'))).toBe(true);
  });

  it('keeps the gate tuning record equal to the playable rules', () => {
    for (const id of ['moon', 'slippery', 'rush'] as const) {
      const rules = TWISTS[id].rules;
      expect(TWIST_TUNING[id]).toEqual({
        gravityScale: rules.gravityScale,
        jumpScale: rules.jumpScale,
        airControlScale: rules.airControlScale,
        airDragScale: rules.airDragScale,
        accelScale: rules.accelScale,
        frictionScale: rules.frictionScale,
        hazardSpeedScale: rules.hazardSpeedScale,
        courseTimeLimit: rules.courseTimeLimit,
        hexTimeLimit: rules.hexTimeLimit,
        hexSugarRush: rules.hexSugarRush,
      });
    }
  });
});
