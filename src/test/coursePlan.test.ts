import { describe, expect, it } from 'vitest';
import { describeCoursePlan, planCourse } from '../game/levels/coursePlan';

describe('Sunrise Scramble course plan', () => {
  it('is deterministic for the same seed', () => {
    expect(planCourse(1234)).toEqual(planCourse(1234));
    expect(planCourse(1234).sections).toEqual(planCourse(1234).sections);
  });

  it('varies at least five visible/behavioural parameters across seeds', () => {
    const a = planCourse(1);
    const b = planCourse(999);
    const differences = [
      a.laneScale !== b.laneScale,
      a.platformOffset !== b.platformOffset,
      a.hurdleHeight !== b.hurdleHeight,
      a.sweeperSpeed !== b.sweeperSpeed,
      a.pusherSpeed !== b.pusherSpeed,
      a.conveyorSpeed !== b.conveyorSpeed,
      a.finishWidth !== b.finishWidth,
      a.shortcut.enabled !== b.shortcut.enabled,
      a.shortcut.z !== b.shortcut.z,
      a.propColors.join(',') !== b.propColors.join(','),
      a.crowdArrangement.join(',') !== b.crowdArrangement.join(','),
      a.sections.some((section, index) => section.hazardPhase !== b.sections[index]?.hazardPhase),
    ].filter(Boolean);
    expect(differences.length).toBeGreaterThanOrEqual(5);
  });

  it('keeps the authored grammar inside documented bounds', () => {
    for (const seed of [0, 1, 42, 0xffffffff, 987654321]) {
      const plan = planCourse(seed);
      expect(plan.sections.map((section) => section.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(plan.sections.map((section) => section.name)).toEqual([
        'BUNTING RUN',
        'WHIRLYBIRD ALLEY',
        'JELLY JUMPS',
        'SLIME SLIDE',
        'CROWN GATE',
      ]);
      expect(plan.length).toBeGreaterThanOrEqual(160);
      expect(plan.length).toBeLessThanOrEqual(196);
      expect(plan.laneScale).toBeGreaterThanOrEqual(0.85);
      expect(plan.laneScale).toBeLessThanOrEqual(1.15);
      expect(plan.platformOffset).toBeGreaterThanOrEqual(-0.75);
      expect(plan.platformOffset).toBeLessThanOrEqual(0.75);
      expect(plan.shortcut.z).toBeGreaterThanOrEqual(-120);
      expect(plan.shortcut.z).toBeLessThanOrEqual(-108);
      expect(plan.shortcut.width).toBeGreaterThan(1);
      expect(plan.propColors).toHaveLength(5);
      expect(plan.crowdArrangement).toHaveLength(8);
      expect(describeCoursePlan(plan)).toHaveLength(10);
    }
  });

  it('closes or places the risky shortcut deterministically', () => {
    const plans = Array.from({ length: 24 }, (_, index) => planCourse(index));
    expect(plans.some((plan) => plan.shortcut.enabled)).toBe(true);
    expect(plans.some((plan) => !plan.shortcut.enabled)).toBe(true);
    for (const plan of plans) {
      if (plan.shortcut.enabled) {
        expect([-1, 1]).toContain(plan.shortcut.side);
        expect(plan.shortcut.z).toBeGreaterThan(-120);
        expect(plan.shortcut.z).toBeLessThan(-108);
      }
    }
  });
});
