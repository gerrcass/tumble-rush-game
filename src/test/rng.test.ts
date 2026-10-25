import { describe, expect, it } from 'vitest';
import { Rng, dailySeed, formatSeed, hashSeed, resolveSeed } from '../game/Rng';

describe('Rng (mulberry32)', () => {
  it('reproduces the exact same sequence for the same seed', () => {
    const a = new Rng(0xdecafbad);
    const b = new Rng(0xdecafbad);
    const first = Array.from({ length: 64 }, () => a.next());
    const second = Array.from({ length: 64 }, () => b.next());
    expect(first).toEqual(second);
  });

  it('produces a different stream for a different seed', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const first = Array.from({ length: 16 }, () => a.next());
    const second = Array.from({ length: 16 }, () => b.next());
    expect(first).not.toEqual(second);
  });

  it('stays in the documented range', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const ranged = rng.float(-3, 7);
      expect(ranged).toBeGreaterThanOrEqual(-3);
      expect(ranged).toBeLessThan(7);
      const integer = rng.int(2, 5);
      expect(integer).toBeGreaterThanOrEqual(2);
      expect(integer).toBeLessThanOrEqual(5);
    }
  });

  it('hashes the daily seed deterministically', () => {
    const day = new Date(2026, 3, 18);
    const a = dailySeed(day);
    const b = dailySeed(day);
    expect(a).toEqual(b);
    expect(a.label).toBe('2026-04-18');
    expect(a.seed).toBe(hashSeed('2026-04-18'));
    expect(formatSeed(a.seed)).toMatch(/^#[0-9A-F]{8}$/);
  });

  it('reads seed overrides from a query string', () => {
    expect(resolveSeed('?seed=123', 9)).toBe(123);
    expect(resolveSeed('?seed=mint', 9)).toBe(hashSeed('mint'));
    expect(resolveSeed('', 9)).toBe(9);
    expect(resolveSeed('?seed=not-a-number', 9)).toBe(hashSeed('not-a-number'));
  });
});
