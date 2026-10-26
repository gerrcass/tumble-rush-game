import {
  hexDisc,
  hexRing,
  axialKey,
  type Axial,
} from './hexGrid';

/**
 * Pure Hexapop arena plans.
 *
 * Every plan is built from the same three-tier hex disc used by M2. The plan
 * only decides which cells survive; tile warnings, the centre perch, the Sugar
 * Rush and the 4-survivor end stay in `Hexapop.ts`. No Three.js, DOM or match
 * dependency, so the show plan, the level, the variety gate and the tests all
 * read the same shape.
 */
export type ArenaPlanId = 'rings' | 'spiral' | 'gearworks';

export const ARENA_PLAN_IDS: readonly ArenaPlanId[] = ['rings', 'spiral', 'gearworks'];

/** Tier radii, outermost first. Kept in lockstep with `Hexapop.TIER_RADII`. */
export const ARENA_TIER_RADII = [6, 4, 3] as const;

export const ARENA_LABELS: Readonly<Record<ArenaPlanId, string>> = {
  rings: 'RINGS',
  spiral: 'SPIRAL',
  gearworks: 'GEARWORKS',
};

export function arenaLabel(id: ArenaPlanId): string {
  return ARENA_LABELS[id];
}

/** Ring index of an axial coordinate (0 at the centre). */
export function axialRing(coord: Axial): number {
  return Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(coord.q + coord.r));
}

/**
 * Cells removed by a plan, per tier. The centre is never removed.
 *
 * - SPIRAL removes one 60-degree sector from every ring, rotating the sector
 *   one side per ring so the remaining floor coils inward.
 * - GEARWORKS cuts one-cell notches on alternating sides of the outer two
 *   rings, leaving a connected gear-like rim.
 */
function removedCells(id: ArenaPlanId, tier: number): Set<string> {
  const removed = new Set<string>();
  if (id === 'rings') return removed;
  const radius = ARENA_TIER_RADII[tier] ?? 0;
  if (id === 'spiral') {
    for (let ring = 1; ring <= radius; ring += 1) {
      const cells = hexRing(ring);
      if (cells.length === 0) continue;
      const side = (ring * 2) % 6;
      const sideLength = ring;
      for (let step = 0; step < sideLength; step += 1) {
        const cell = cells[side * sideLength + step];
        if (cell) removed.add(axialKey(cell));
      }
    }
    return removed;
  }
  // GEARWORKS: notch the outer two rings on three alternating sides.
  if (radius >= 2) {
    for (let ring = Math.max(2, radius - 1); ring <= radius; ring += 1) {
      const cells = hexRing(ring);
      const sideLength = ring;
      for (const side of [0, 2, 4]) {
        for (let step = 0; step < Math.min(2, sideLength); step += 1) {
          const cell = cells[side * sideLength + step];
          if (cell) removed.add(axialKey(cell));
        }
      }
    }
  }
  return removed;
}

/** The surviving cells of one tier, in the same order as `hexDisc(radius)`. */
export function arenaCells(id: ArenaPlanId, tier: number): Axial[] {
  const radius = ARENA_TIER_RADII[tier] ?? 0;
  const removed = removedCells(id, tier);
  return hexDisc(radius).filter((coord) => !removed.has(axialKey(coord)));
}

/** Planned tile count before the Hexapop centre chute is cut. */
export function arenaTileCount(id: ArenaPlanId): number {
  return ARENA_TIER_RADII.reduce((total, _radius, tier) => total + arenaCells(id, tier).length, 0);
}

/**
 * Breadth-first connectivity inside one tier from the centre (or the nearest
 * surviving cell to the centre). Returns the set of unreachable cells; an empty
 * array means the floor has no islands.
 */
export function arenaDisconnected(id: ArenaPlanId, tier: number): Axial[] {
  const cells = arenaCells(id, tier);
  if (cells.length === 0) return [];
  const byKey = new Map(cells.map((cell) => [axialKey(cell), cell]));
  let start = byKey.get('0,0');
  if (!start) {
    start = cells.reduce((best, cell) => (axialRing(cell) < axialRing(best) ? cell : best), cells[0]!);
  }
  const seen = new Set<string>();
  const queue: Axial[] = [start];
  seen.add(axialKey(start));
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbour of [
      { q: current.q + 1, r: current.r },
      { q: current.q + 1, r: current.r - 1 },
      { q: current.q, r: current.r - 1 },
      { q: current.q - 1, r: current.r },
      { q: current.q - 1, r: current.r + 1 },
      { q: current.q, r: current.r + 1 },
    ]) {
      const key = axialKey(neighbour);
      if (!byKey.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push(neighbour);
    }
  }
  return cells.filter((cell) => !seen.has(axialKey(cell)));
}
