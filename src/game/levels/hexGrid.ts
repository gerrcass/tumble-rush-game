/**
 * Axial hex coordinates for pointy-top hexagons.
 *
 * q grows to the east, r grows to the south-east, and the third cube axis is
 * derived (`s = -q - r`). Every helper here is pure so Hexapop layout and bot
 * navigation can be tested headlessly and reproduced from the seed.
 */
export interface Axial {
  q: number;
  r: number;
}

export const HEX_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function axialKey(coord: Axial): string {
  return `${coord.q},${coord.r}`;
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexNeighbours(coord: Axial): Axial[] {
  return HEX_DIRECTIONS.map((direction) => ({
    q: coord.q + direction.q,
    r: coord.r + direction.r,
  }));
}

/** Every hex within `radius` of the origin, ordered by ring then angle. */
export function hexDisc(radius: number): Axial[] {
  if (radius < 0) return [];
  const cells: Axial[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r += 1) cells.push({ q, r });
  }
  return cells;
}

/** The exact outer ring at `radius` (6 * radius cells, 1 at radius 0). */
export function hexRing(radius: number): Axial[] {
  if (radius < 0) return [];
  if (radius === 0) return [{ q: 0, r: 0 }];
  const cells: Axial[] = [];
  let coord: Axial = { q: -radius, r: radius };
  for (const direction of HEX_DIRECTIONS) {
    for (let step = 0; step < radius; step += 1) {
      cells.push(coord);
      coord = { q: coord.q + direction.q, r: coord.r + direction.r };
    }
  }
  return cells;
}

export function hexRingCount(radius: number): number {
  return radius <= 0 ? 1 : radius * 6;
}

export function hexDiscCount(radius: number): number {
  if (radius < 0) return 0;
  return 1 + 3 * radius * (radius + 1);
}

export function hexRound(qf: number, rf: number): Axial {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q === 0 ? 0 : q, r: r === 0 ? 0 : r };
}
