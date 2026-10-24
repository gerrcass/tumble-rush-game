/**
 * Deterministic RNG — mulberry32.
 *
 * Every layout, cosmetic and cosmetic-phase decision in Tumble Rush is drawn
 * from a seeded Rng. Never use Math.random() for gameplay content: a seed must
 * reproduce the same training deck, course and show.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  float(min = 0, max = 1): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with the supplied probability. */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** A stable child stream, useful for independent course sections. */
  fork(salt: number): Rng {
    return new Rng((this.state ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0);
  }
}

/** Hash a string seed (for example the daily "YYYY-MM-DD") to a uint32. */
export function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The daily seed is always the local calendar date, formatted YYYY-MM-DD. */
export function dailySeed(date = new Date()): { label: string; seed: number } {
  const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
  return { label, seed: hashSeed(label) };
}

/** Read a seed override from the URL (?seed=1234) or generate a repeatable random one. */
export function resolveSeed(search: string, fallback: number): number {
  const params = new URLSearchParams(search);
  const raw = params.get('seed');
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) return Math.trunc(parsed) >>> 0;
  return hashSeed(raw);
}

export function formatSeed(seed: number): string {
  return `#${(seed >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}
