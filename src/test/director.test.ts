import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_PRESETS,
  SHOW_ROUNDS,
  resolveRound,
  type RoundPerformance,
} from '../game/match/Director';

function performance(index: number, overrides: Partial<RoundPerformance> = {}): RoundPerformance {
  return {
    id: String(index),
    name: `Tumbler ${index}`,
    isPlayer: index === 0,
    finishTime: null,
    progress: 0,
    eliminated: false,
    eliminatedAt: null,
    won: false,
    height: 0,
    distanceToCrown: 0,
    ...overrides,
  };
}

describe('Show Director', () => {
  it('qualifies exactly the top eight Course finishers by finish time, then id', () => {
    const field = Array.from({ length: 16 }, (_, index) =>
      performance(index, {
        finishTime: index < 10 ? 40 + (index % 3) : null,
        progress: index < 10 ? 1 : 0.2 + index * 0.01,
      }),
    );
    const placements = resolveRound(SHOW_ROUNDS[0]!, field);
    expect(placements).toHaveLength(16);
    expect(placements.filter((entry) => entry.qualified)).toHaveLength(8);
    expect(placements[0]?.qualified).toBe(true);
    // Three entrants tie on 40 s; ids break the tie deterministically.
    expect(placements.slice(0, 4).map((entry) => entry.name)).toEqual([
      'Tumbler 0',
      'Tumbler 3',
      'Tumbler 6',
      'Tumbler 9',
    ]);
    expect(placements[7]?.qualified).toBe(true);
    expect(placements[8]?.qualified).toBe(false);
  });

  it('fills empty qualifier slots from the best eliminated contestants', () => {
    const field = Array.from({ length: 16 }, (_, index) =>
      performance(index, {
        eliminated: index !== 0,
        eliminatedAt: index === 0 ? null : index,
        progress: index / 20,
      }),
    );
    const placements = resolveRound(SHOW_ROUNDS[0]!, field);
    expect(placements.filter((entry) => entry.qualified)).toHaveLength(8);
    expect(placements[0]?.id).toBe('0');
    // Last out ranks as the best eliminated fallback.
    expect(placements[1]?.id).toBe('15');
    expect(placements[1]?.qualified).toBe(true);
  });

  it('qualifies survivors by height, then distance to centre, then id', () => {
    const field = [
      performance(1, { height: 1, distanceToCrown: 2 }),
      performance(2, { height: 2, distanceToCrown: 3 }),
      performance(3, { height: 2, distanceToCrown: 1 }),
      performance(4, { height: 0, eliminated: true, eliminatedAt: 12 }),
      performance(5, { height: 3, eliminated: true, eliminatedAt: 20 }),
      performance(6, { height: 0.5 }),
    ];
    const placements = resolveRound(SHOW_ROUNDS[1]!, field);
    expect(placements.slice(0, 4).map((entry) => entry.id)).toEqual(['3', '2', '1', '6']);
    expect(placements[4]?.id).toBe('5');
    expect(placements[4]?.qualified).toBe(false);
  });

  it('crown winner outranks height, and timeout goes to the highest body', () => {
    const winner = resolveRound(SHOW_ROUNDS[2]!, [
      performance(0, { height: 20 }),
      performance(1, { height: 21 }),
      performance(2, { height: 10, won: true }),
    ]);
    expect(winner[0]?.id).toBe('2');
    expect(winner[0]?.qualified).toBe(true);

    const timeout = resolveRound(SHOW_ROUNDS[2]!, [
      performance(0, { height: 20 }),
      performance(1, { height: 21 }),
      performance(2, { height: 10 }),
    ]);
    expect(timeout[0]?.id).toBe('1');
  });

  it('runs a profile-free show to exactly 8, 4, and 1 qualifiers', () => {
    let field = Array.from({ length: 16 }, (_, index) =>
      performance(index, { progress: index / 20, height: index / 20 }),
    );
    for (const definition of SHOW_ROUNDS) {
      expect(field.length).toBe(definition.starters);
      const placements = resolveRound(definition, field);
      expect(placements.filter((entry) => entry.qualified)).toHaveLength(definition.qualifiers);
      field = placements
        .filter((entry) => entry.qualified)
        .map((_entry, index) =>
          performance(index, { height: 3 - index, progress: 0.5 }),
        );
    }
    expect(field).toHaveLength(1);
  });

  it('keeps difficulty presets within conservative bot bounds', () => {
    expect(DIFFICULTY_PRESETS.chill.skill).toBeLessThan(0);
    expect(DIFFICULTY_PRESETS.champion.skill).toBeGreaterThan(0);
    expect(DIFFICULTY_PRESETS.champion.reaction).toBeLessThan(0);
    expect(DIFFICULTY_PRESETS.chill.mistake).toBeGreaterThan(1);
  });
});
