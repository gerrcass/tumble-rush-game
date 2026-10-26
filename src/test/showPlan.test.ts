import { describe, expect, it } from 'vitest';
import {
  COURSE_MODULES,
  MIDDLE_SECTION_IDS,
  planShow,
  type MiddleSectionId,
} from '../game/levels/coursePlan';
import {
  ARENA_PLAN_IDS,
  arenaCells,
  arenaDisconnected,
  arenaTileCount,
  axialRing,
} from '../game/levels/arenaPlan';

/** Same 12-seed sweep as the external variety gate. */
const SWEEP_SEEDS = Array.from({ length: 12 }, (_, index) => (20260418 + index * 104729) >>> 0);
const sweepSeeds = (count: number) => SWEEP_SEEDS.slice(0, count);

describe('M3 show plan', () => {
  it('is pure and deterministic for the same seed', () => {
    expect(planShow(1234)).toEqual(planShow(1234));
    expect(planShow(1234).course).toEqual(planShow(1234).course);
    expect(planShow(0xffffffff)).toEqual(planShow(0xffffffff));
  });

  it('builds each lap as A + three distinct middles + E inside the bands', () => {
    for (const seed of [0, 1, 42, 17, 0xffffffff, 987654321]) {
      const plan = planShow(seed);
      for (const lap of plan.course.laps) {
        expect(lap.route).toHaveLength(3);
        expect(new Set(lap.route).size).toBe(3);
        expect(lap.route.every((id) => MIDDLE_SECTION_IDS.includes(id))).toBe(true);
        expect(lap.sections.map((section) => section.id)).toEqual(['A', ...lap.route, 'E']);
        expect(lap.difficulty).toBeGreaterThanOrEqual(6);
        expect(lap.difficulty).toBeLessThanOrEqual(8);
        expect(lap.length).toBeGreaterThanOrEqual(165);
        expect(lap.length).toBeLessThanOrEqual(185);
        expect(lap.finishZ).toBe(lap.startZ - lap.length);
        expect(lap.sections[lap.sections.length - 1]?.endZ).toBe(lap.finishZ);
        // Monotonic, non-overlapping modules in route order.
        for (let index = 1; index < lap.sections.length; index += 1) {
          expect(lap.sections[index]!.startZ).toBe(lap.sections[index - 1]!.endZ);
        }
        for (const id of lap.route) {
          const module = COURSE_MODULES[id];
          expect(module.length).toBeGreaterThanOrEqual(36);
          expect(module.length).toBeLessThanOrEqual(40);
          expect(module.bookend).toBe(false);
        }
      }
      expect(plan.course.length).toBe(plan.course.laps[0]!.length);
      expect(plan.course.courseLength).toBeGreaterThanOrEqual(330);
      expect(plan.course.courseLength).toBeLessThanOrEqual(370);
      expect(plan.course.courseFinishZ).toBe(plan.course.laps[1]!.finishZ);
      expect(plan.course.courseLength).toBe(plan.course.startZ - plan.course.courseFinishZ);
      expect(plan.course.lapOffsetZ).toBe(
        plan.course.laps[1]!.startZ - plan.course.laps[0]!.startZ,
      );
      const lapOne = new Set<MiddleSectionId>(plan.course.laps[0]!.route);
      const lapTwo = new Set<MiddleSectionId>(plan.course.laps[1]!.route);
      expect(plan.course.laps[0]!.route).not.toEqual(plan.course.laps[1]!.route);
      expect([...lapOne].filter((id) => lapTwo.has(id)).length).toBeLessThanOrEqual(2);
    }
  });

  it('covers all ten legal three-middle routes and both new sections across the sweep', () => {
    const seen = new Set<string>();
    const seeds = sweepSeeds(24);
    for (const seed of seeds) {
      for (const lap of planShow(seed).course.laps) seen.add([...lap.route].sort().join(''));
    }
    expect(seen.size).toBe(10);
  });

  it('produces the M3 variety targets on the 12-seed gate sweep', () => {
    const plans = sweepSeeds(12).map((seed) => planShow(seed));
    expect(new Set(plans.map((plan) => plan.courseSignature)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(plans.map((plan) => plan.arena)).size).toBe(3);
    expect(plans.filter((plan) => plan.courseSignature.split('/').some((lap) => lap.includes('F'))).length).toBeGreaterThanOrEqual(4);
    expect(plans.filter((plan) => plan.courseSignature.split('/').some((lap) => lap.includes('G'))).length).toBeGreaterThanOrEqual(4);
    for (const plan of plans) {
      expect(plan.label).toBe(`COURSE ${plan.routeLabel} · ARENA ${plan.arenaLabel}`);
      expect(plan.signature).toBe(`${plan.courseSignature} · ${plan.arenaLabel}`);
      expect(plan.courseSignature.split('/')).toHaveLength(2);
      expect(plan.routeLabel).toContain(' / ');
    }
  });

  it('keeps the shortcut inside section D and relocatable', () => {
    for (const seed of sweepSeeds(24)) {
      const plan = planShow(seed);
      const d = plan.course.laps[0]!.sections.find((section) => section.id === 'D');
      if (!plan.course.shortcut.enabled || !d) continue;
      expect(plan.course.shortcut.localZ).toBeGreaterThanOrEqual(-24);
      expect(plan.course.shortcut.localZ).toBeLessThanOrEqual(-12);
      expect(plan.course.shortcut.z).toBeCloseTo(d.startZ + plan.course.shortcut.localZ, 6);
    }
  });
});

describe('M3 Hexapop arena plans', () => {
  it('offers three distinct plans, all connected and inside the tile bounds', () => {
    for (const id of ARENA_PLAN_IDS) {
      const count = arenaTileCount(id);
      expect(count).toBeGreaterThanOrEqual(180);
      expect(count).toBeLessThanOrEqual(230);
      for (let tier = 0; tier < 3; tier += 1) {
        const cells = arenaCells(id, tier);
        expect(cells.length).toBeGreaterThan(0);
        expect(arenaDisconnected(id, tier)).toEqual([]);
        expect(cells.some((cell) => cell.q === 0 && cell.r === 0)).toBe(true);
      }
    }
    expect(new Set(ARENA_PLAN_IDS).size).toBe(3);
  });

  it('removes a visibly different set of cells per plan', () => {
    const shape = (id: (typeof ARENA_PLAN_IDS)[number]) =>
      [0, 1, 2].map((tier) => arenaCells(id, tier).map((cell) => `${cell.q},${cell.r}`).join('|')).join('/');
    expect(shape('rings')).not.toBe(shape('spiral'));
    expect(shape('rings')).not.toBe(shape('gearworks'));
    expect(shape('spiral')).not.toBe(shape('gearworks'));
    const spiralRemoved = [0, 1, 2].reduce(
      (sum, tier) => sum + arenaCells('rings', tier).length - arenaCells('spiral', tier).length,
      0,
    );
    const gearRemoved = [0, 1, 2].reduce(
      (sum, tier) => sum + arenaCells('rings', tier).length - arenaCells('gearworks', tier).length,
      0,
    );
    expect(spiralRemoved).toBeGreaterThan(gearRemoved);
    expect(axialRing({ q: 0, r: 0 })).toBe(0);
  });

  it('keeps the centre tile and enough inner-tier seats for eight entrants', () => {
    for (const id of ARENA_PLAN_IDS) {
      const top = arenaCells(id, 0);
      expect(top.some((cell) => cell.q === 0 && cell.r === 0)).toBe(true);
      expect(top.length).toBeGreaterThanOrEqual(8);
    }
  });
});
