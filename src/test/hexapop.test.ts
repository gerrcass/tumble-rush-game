import { describe, expect, it } from 'vitest';
import { createLevel } from '../game/levels/factory';
import type { Hexapop } from '../game/levels/Hexapop';
import { FIXED_STEP } from '../game/physics/PhysicsWorld';

function simulate(level: Hexapop, seconds: number): void {
  const steps = Math.round(seconds / FIXED_STEP);
  for (let i = 0; i < steps; i += 1) level.step(FIXED_STEP, []);
}

describe('Hexapop Sugar Rush', () => {
  it('warns and drops the whole outer ring at 45 s', () => {
    const level = createLevel('hexapop', 20260418) as Hexapop;
    simulate(level, 45.1);

    const before = level.queryTiles();
    const outerRing = Math.max(...before.filter((tile) => tile.state !== 'gone').map((tile) => tile.ring));
    const warnings = before.filter(
      (tile) => tile.ring === outerRing && tile.state === 'warning',
    );
    expect(outerRing).toBe(6);
    expect(warnings.length).toBeGreaterThanOrEqual(30);

    // The warning is one second in the Sugar Rush, then the ring is gone.
    simulate(level, 1.3);
    const after = level.queryTiles();
    const remaining = after.filter(
      (tile) => tile.ring === outerRing && (tile.state === 'idle' || tile.state === 'warning'),
    );
    expect(remaining).toHaveLength(0);
    expect(level.tileCount).toBeLessThan(223);
    expect(level.status().phase).toBe('SUGAR RUSH');
    level.dispose();
  });

  it('keeps the pre-rush warning readable and the timer inside the M2 band', () => {
    const level = createLevel('hexapop', 7) as Hexapop;
    simulate(level, 10);
    expect(level.status().phase).not.toBe('SUGAR RUSH');
    expect(level.status().timeLimit).toBeLessThanOrEqual(50);
    expect(level.status().timeLimit).toBeGreaterThanOrEqual(45);
    level.dispose();
  });
});
