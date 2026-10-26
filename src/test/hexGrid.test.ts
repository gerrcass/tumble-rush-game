import { describe, expect, it } from 'vitest';
import {
  HEX_DIRECTIONS,
  axialKey,
  hexDisc,
  hexDiscCount,
  hexDistance,
  hexNeighbours,
  hexRing,
  hexRingCount,
  hexRound,
} from '../game/levels/hexGrid';
import { hexToWorld, worldToHex } from '../game/levels/hexWorld';

describe('hexGrid — axial honeycomb helpers', () => {
  it('builds the documented 19/37/61 tile discs', () => {
    expect(hexDiscCount(2)).toBe(19);
    expect(hexDiscCount(3)).toBe(37);
    expect(hexDiscCount(4)).toBe(61);
    expect(hexDisc(2)).toHaveLength(19);
    expect(hexDisc(3)).toHaveLength(37);
    expect(hexDisc(4)).toHaveLength(61);
  });

  it('generates exact outer rings with no duplicates', () => {
    for (let radius = 1; radius <= 4; radius += 1) {
      const ring = hexRing(radius);
      expect(ring).toHaveLength(hexRingCount(radius));
      expect(new Set(ring.map(axialKey)).size).toBe(ring.length);
      for (const coord of ring) {
        expect(hexDistance(coord, { q: 0, r: 0 })).toBe(radius);
      }
    }
    expect(hexRing(0)).toEqual([{ q: 0, r: 0 }]);
  });

  it('gives every tile six unique distance-1 neighbours', () => {
    const centre = { q: 2, r: -1 };
    const neighbours = hexNeighbours(centre);
    expect(neighbours).toHaveLength(6);
    expect(new Set(neighbours.map(axialKey)).size).toBe(6);
    for (const neighbour of neighbours) expect(hexDistance(centre, neighbour)).toBe(1);
    expect(neighbours).toEqual(
      HEX_DIRECTIONS.map((direction) => ({
        q: centre.q + direction.q,
        r: centre.r + direction.r,
      })),
    );
  });

  it('round-trips axial coordinates through world space', () => {
    const size = 1.15;
    for (const coord of hexDisc(4)) {
      const world = hexToWorld(coord, size);
      const roundTrip = worldToHex(world.x, world.z, size);
      expect(roundTrip).toEqual(coord);
    }
  });

  it('rounds fractional axial coordinates to the nearest valid hex', () => {
    expect(hexRound(0.2, 0.1)).toEqual({ q: 0, r: 0 });
    expect(hexRound(1.1, -0.1)).toEqual({ q: 1, r: 0 });
    expect(hexRound(-0.9, 1.05)).toEqual({ q: -1, r: 1 });
  });
});
