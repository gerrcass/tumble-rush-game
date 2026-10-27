import { describe, expect, it } from 'vitest';
import {
  CLASSIC_RULES,
  TWISTS,
  TWIST_IDS,
  twistForSeed,
  twistHash,
  twistRulesFor,
  type TwistId,
} from '../game/twist';
import { GRAVITY } from '../game/physics/PhysicsWorld';
import { MOVEMENT_BASE } from '../game/player/BeanController';
import { SHOW_ROUNDS } from '../game/match/Director';
import { planShow } from '../game/levels/coursePlan';

const SWEEP_SEEDS = Array.from({ length: 12 }, (_, index) => (20260418 + index * 104729) >>> 0);

describe('M4 twist contract', () => {
  it('selects a valid twist deterministically for a seed', () => {
    const seen = new Set<TwistId>();
    for (let seed = 0; seed < 300; seed += 1) {
      const first = twistForSeed(seed);
      const second = twistForSeed(seed);
      expect(second).toBe(first);
      expect(TWIST_IDS).toContain(first.id);
      seen.add(first.id);
    }
    expect([...seen].sort()).toEqual([...TWIST_IDS].sort());
    expect(twistForSeed(0xffffffff)).toBe(twistForSeed(0xffffffff));
    expect(twistHash(1234)).toBe(twistHash(1234));
  });

  it('is balanced across a 300-seed sweep (20–45% each)', () => {
    const counts: Record<TwistId, number> = { moon: 0, slippery: 0, rush: 0 };
    for (let seed = 0; seed < 300; seed += 1) counts[twistForSeed(seed).id] += 1;
    for (const id of TWIST_IDS) {
      expect(counts[id] / 300).toBeGreaterThanOrEqual(0.2);
      expect(counts[id] / 300).toBeLessThanOrEqual(0.45);
    }
  });

  it('covers the three twists at least three times across the 12 gate seeds', () => {
    const counts: Record<TwistId, number> = { moon: 0, slippery: 0, rush: 0 };
    for (const seed of SWEEP_SEEDS) counts[twistForSeed(seed).id] += 1;
    for (const id of TWIST_IDS) expect(counts[id]).toBeGreaterThanOrEqual(3);
    // The recorded M4 deck: 6 moon, 3 slippery, 3 rush.
    expect(counts).toEqual({ moon: 6, slippery: 3, rush: 3 });
  });

  it('gives every twist a readable identity and matching rules id', () => {
    for (const id of TWIST_IDS) {
      const twist = TWISTS[id];
      expect(twist.id).toBe(id);
      expect(twist.label.length).toBeGreaterThan(0);
      expect(twist.short.length).toBeGreaterThan(0);
      expect(twist.blurb.length).toBeGreaterThan(0);
      expect(Number.isFinite(twist.accent)).toBe(true);
      expect(twist.rules.id).toBe(id);
      expect(twist.rules.courseTimeLimit).toBeGreaterThan(0);
      expect(twist.rules.hexTimeLimit).toBeGreaterThan(0);
      expect(twist.rules.hexSugarRush).toBeGreaterThan(0);
      expect(twist.rules.hexSugarRush).toBeLessThan(twist.rules.hexTimeLimit);
    }
    expect(new Set(TWIST_IDS.map((id) => TWISTS[id].label)).size).toBe(3);
    expect(new Set(TWIST_IDS.map((id) => TWISTS[id].short)).size).toBe(3);
  });

  it('CLASSIC_RULES reproduces the M3 physics and clock constants', () => {
    expect(GRAVITY).toBe(-26);
    expect(CLASSIC_RULES.id).toBe('classic');
    expect(GRAVITY * CLASSIC_RULES.gravityScale).toBe(-26);
    expect(MOVEMENT_BASE.jumpVelocity * CLASSIC_RULES.jumpScale).toBe(8.6);
    expect(MOVEMENT_BASE.airControl * CLASSIC_RULES.airControlScale).toBe(0.65);
    expect(MOVEMENT_BASE.airDrag * CLASSIC_RULES.airDragScale).toBe(1.2);
    expect(MOVEMENT_BASE.groundAccel * CLASSIC_RULES.accelScale).toBe(55);
    expect(MOVEMENT_BASE.groundFriction * CLASSIC_RULES.frictionScale).toBe(14);
    expect(MOVEMENT_BASE.maxRunSpeed).toBe(8);
    expect(CLASSIC_RULES.hazardSpeedScale).toBe(1);
    expect(CLASSIC_RULES.courseTimeLimit).toBe(SHOW_ROUNDS[0]!.timeLimit);
    expect(CLASSIC_RULES.hexTimeLimit).toBe(SHOW_ROUNDS[1]!.timeLimit);
    expect(CLASSIC_RULES.hexSugarRush).toBe(45);
  });

  it('gives the plan a stable twist, signature and label without shifting the M3 route', () => {
    // M3 variety-table anchors: the twist hash must not consume routeRng draws.
    expect(planShow(20260418).courseSignature).toBe('B-C-D/C-F-G');
    expect(planShow(20260418).arena).toBe('rings');
    expect(planShow(20365147).courseSignature).toBe('C-D-G/B-C-G');
    expect(planShow(20365147).arena).toBe('spiral');
    expect(planShow(21412437).courseSignature).toBe('B-C-D/B-C-G');
    expect(planShow(21412437).arena).toBe('gearworks');

    for (const seed of SWEEP_SEEDS) {
      const plan = planShow(seed);
      expect(plan.twist).toBe(twistForSeed(seed));
      expect(plan.signature).toBe(
        `${plan.courseSignature} · ${plan.arenaLabel} · ${plan.twist.short}`,
      );
      expect(plan.label).toBe(
        `COURSE ${plan.routeLabel} · ARENA ${plan.arenaLabel} · TWIST ${plan.twist.label}`,
      );
      expect(plan.signature).toContain(plan.twist.short);
      expect(plan.label).toContain(plan.twist.label);
    }
  });

  it('uses the plan twist on the qualifiers and classic on the Crown/Training', () => {
    const plan = planShow(20260418);
    expect(twistRulesFor('course', plan.twist)).toBe(plan.twist.rules);
    expect(twistRulesFor('hexapop', plan.twist)).toBe(plan.twist.rules);
    expect(twistRulesFor('crown-climb', plan.twist)).toBe(CLASSIC_RULES);
    expect(twistRulesFor('training', plan.twist)).toBe(CLASSIC_RULES);
    expect(plan.twist.rules).not.toBe(CLASSIC_RULES);
  });
});
