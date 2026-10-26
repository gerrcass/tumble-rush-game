import { Vector3 } from 'three';
import { hexRound, type Axial } from './hexGrid';

/**
 * World-space helpers for the axial hex grid. Kept separate from `hexGrid.ts`
 * so the show plan and arena plans stay pure data (no Three.js import).
 */

/**
 * World-space centre of a pointy-top tile. `size` is the circumradius, i.e. the
 * distance from centre to corner, which is also the tile's nominal radius.
 */
export function hexToWorld(coord: Axial, size: number, out?: Vector3): Vector3 {
  const x = size * Math.sqrt(3) * (coord.q + coord.r / 2);
  const z = size * 1.5 * coord.r;
  if (out) {
    out.set(x, 0, z);
    return out;
  }
  return new Vector3(x, 0, z);
}

/** Nearest axial tile for a world XZ position (used by collapse lookups). */
export function worldToHex(x: number, z: number, size: number): Axial {
  const q = ((Math.sqrt(3) / 3) * x - z / 3) / size;
  const r = ((2 / 3) * z) / size;
  return hexRound(q, r);
}
