import { describe, expect, it } from 'vitest';
import { createLevel } from '../game/levels/factory';
import type { Course } from '../game/levels/Course';

/** Same 24-seed sweep used by the plan coverage test. */
const SEEDS = Array.from({ length: 24 }, (_, index) => (20260418 + index * 104729) >>> 0);

describe('M3 Course routes build in the real level', () => {
  it('builds every legal three-middle route without a broken bookend', () => {
    const combos = new Set<string>();
    for (const seed of SEEDS) {
      const course = createLevel('course', seed) as Course;
      const plan = course.plan;
      expect(plan.sections).toHaveLength(10);
      combos.add(plan.laps[0]!.route.join(''));
      combos.add(plan.laps[1]!.route.join(''));
      expect(plan.sections[0]!.startZ).toBe(plan.startZ);
      expect(plan.sections[9]!.endZ).toBe(plan.courseFinishZ);
      expect(course.finishPosition.z).toBeCloseTo(plan.courseFinishZ, 5);
      expect(course.colliders.length).toBeGreaterThan(50);
      expect(course.waypoints.length).toBeGreaterThan(40);
      for (const section of plan.sections) {
        expect(section.startZ).toBeLessThanOrEqual(plan.startZ);
        expect(section.endZ).toBeGreaterThanOrEqual(plan.courseFinishZ);
        expect(section.startZ).toBeGreaterThan(section.endZ);
      }
      // Every module contributes geometry and a checkpoint at its planned
      // position; a route with a missing builder would fail here.
      for (const section of plan.sections) {
        expect(course.colliders.some((collider) => {
          const z = collider.position.z;
          return z <= section.startZ + 0.01 && z >= section.endZ - 0.01;
        })).toBe(true);
        expect(course.checkpoints.some((checkpoint) => {
          const z = checkpoint.position.z;
          return z <= section.startZ + 0.01 && z >= section.endZ - 0.01;
        })).toBe(true);
      }
      course.dispose();
    }
    expect(combos.size).toBe(10);
  });

  it('keeps every moving hazard at its authored module after a step', () => {
    for (const seed of [20260418, 7]) {
      const course = createLevel('course', seed) as Course;
      const before = course.colliders.map((collider) => collider.position.clone());
      course.step(1 / 60, []);
      course.colliders.forEach((collider, index) => {
        const start = before[index]!;
        const drift = Math.hypot(
          collider.position.x - start.x,
          collider.position.y - start.y,
          collider.position.z - start.z,
        );
        // A pusher/motion base at the wrong module would jump tens of units on
        // the first step; a pendulum's authored swing can be a few units.
        expect(drift, `collider ${index} teleported`).toBeLessThan(8);
      });
      course.dispose();
    }
  });
});
