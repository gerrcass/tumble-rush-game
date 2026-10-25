import { describe, expect, it } from 'vitest';
import { createLevel } from '../game/levels/factory';
import { startPositionsFor } from '../game/levels/startPositions';

function entrants(count: number, playerIndex: number): Array<{ isPlayer: boolean }> {
  return Array.from({ length: count }, (_, index) => ({ isPlayer: index === playerIndex }));
}

describe('Round start positions', () => {
  it('reserves the Hexapop centre perch for the human even when they are not index zero', () => {
    const level = createLevel('hexapop', 20260418);
    for (const playerIndex of [0, 3, 7]) {
      const positions = startPositionsFor(level, 'hexapop', entrants(8, playerIndex), 20260418);
      expect(positions).toHaveLength(8);
      expect(positions[playerIndex]?.x).toBeCloseTo(0, 5);
      expect(positions[playerIndex]?.z).toBeCloseTo(0, 5);
      // No bot may share the authored safe perch.
      expect(
        positions.filter(
          (position, index) => index !== playerIndex && Math.abs(position.x) < 0.01 && Math.abs(position.z) < 0.01,
        ),
      ).toHaveLength(0);
    }
    level.dispose();
  });

  it('keeps the Course player at the back of the start deck', () => {
    const level = createLevel('course', 7);
    const positions = startPositionsFor(level, 'course', entrants(16, 0), 7);
    expect(positions).toHaveLength(16);
    expect(positions[0]?.z).toBeGreaterThan(positions[1]?.z ?? 0);
    expect(positions[0]?.x).toBeCloseTo(level.startPosition.x, 5);
    level.dispose();
  });
});
