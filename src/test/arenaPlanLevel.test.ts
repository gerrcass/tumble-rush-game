import { describe, expect, it } from 'vitest';
import { createLevel } from '../game/levels/factory';
import type { Hexapop } from '../game/levels/Hexapop';
import { PhysicsWorld, FIXED_STEP } from '../game/physics/PhysicsWorld';
import { BeanBody } from '../game/physics/BeanBody';
import { planShow } from '../game/levels/coursePlan';

/** One seed per arena plan, chosen from the real show plan. */
const ARENA_SEEDS = (() => {
  const seeds: Record<string, number> = {};
  for (let index = 0; index < 24 && Object.keys(seeds).length < 3; index += 1) {
    const seed = (20260418 + index * 104729) >>> 0;
    const plan = planShow(seed);
    seeds[plan.arena] ??= seed;
  }
  return seeds;
})();

function disconnectedTiles(level: Hexapop): string[] {
  const tiles = level.queryTiles();
  const byTier = new Map<number, Map<string, { x: number; z: number }>>();
  for (const tile of tiles) {
    if (!byTier.has(tile.tier)) byTier.set(tile.tier, new Map());
    // queryTiles exposes world positions; rebuild axial keys from the level's
    // own tile order via the plan-independent neighbour test below.
    byTier.get(tile.tier)!.set(`${tile.x.toFixed(3)},${tile.z.toFixed(3)}`, tile);
  }
  const missing: string[] = [];
  for (const [tier, map] of byTier) {
    const start = [...map.values()].reduce((best, tile) =>
      Math.hypot(tile.x, tile.z) < Math.hypot(best.x, best.z) ? tile : best,
    );
    const seen = new Set<string>();
    const queue = [start];
    seen.add(`${start.x.toFixed(3)},${start.z.toFixed(3)}`);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const tile of map.values()) {
        const key = `${tile.x.toFixed(3)},${tile.z.toFixed(3)}`;
        if (seen.has(key)) continue;
        if (Math.hypot(tile.x - current.x, tile.z - current.z) <= 2.01) {
          seen.add(key);
          queue.push(tile);
        }
      }
    }
    if (seen.size !== map.size) missing.push(`tier ${tier}: ${map.size - seen.size} unreachable`);
  }
  return missing;
}

describe('M3 Hexapop arena plans in the real level', () => {
  it('builds each plan with the documented tile count and 8 seats', () => {
    for (const [arena, seed] of Object.entries(ARENA_SEEDS)) {
      const level = createLevel('hexapop', seed) as Hexapop;
      expect(level.arena).toBe(arena);
      expect(level.arenaLabel).toBe(arena.toUpperCase());
      expect(level.tileCount).toBeGreaterThanOrEqual(180);
      expect(level.tileCount).toBeLessThanOrEqual(230);
      const seats = level.spawnPoints(8);
      expect(seats).toHaveLength(8);
      expect(seats[0]!.x).toBeCloseTo(0, 5);
      expect(seats[0]!.z).toBeCloseTo(0, 5);
      const centre = level
        .queryTiles()
        .find((tile) => tile.tier === 0 && Math.abs(tile.x) < 0.01 && Math.abs(tile.z) < 0.01);
      expect(centre?.safe).toBe(true);
      expect(disconnectedTiles(level), `${arena} islands`).toEqual([]);
      level.dispose();
    }
  });

  it('drops a stationary centre player on every plan', () => {
    for (const seed of Object.values(ARENA_SEEDS)) {
      const level = createLevel('hexapop', seed) as Hexapop;
      const world = new PhysicsWorld();
      const body = new BeanBody({ position: level.startPosition.clone() });
      for (const collider of level.colliders) world.addCollider(collider);
      world.addBody(body);
      for (let step = 0; step < Math.round(7 / FIXED_STEP); step += 1) {
        level.step(FIXED_STEP, [body]);
        world.step(FIXED_STEP);
        if (body.eliminated) break;
      }
      expect(body.eliminated, `${level.arena} centre player survived`).toBe(true);
      level.dispose();
    }
  });

  it('keeps the Sugar Rush rules identical on every plan', () => {
    for (const seed of Object.values(ARENA_SEEDS)) {
      const level = createLevel('hexapop', seed) as Hexapop;
      const before = level.queryTiles();
      const outer = Math.max(...before.filter((tile) => tile.state !== 'gone').map((tile) => tile.ring));
      for (let step = 0; step < Math.round(45.1 / FIXED_STEP); step += 1) {
        level.step(FIXED_STEP, []);
      }
      const warnings = level
        .queryTiles()
        .filter((tile) => tile.ring === outer && tile.state === 'warning');
      expect(warnings.length, `${level.arena} outer ring warning`).toBeGreaterThan(0);
      expect(level.status().phase).toBe('SUGAR RUSH');
      level.dispose();
    }
  });
});
