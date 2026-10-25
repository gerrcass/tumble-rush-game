import { Vector3 } from 'three';
import { Rng } from '../Rng';
import type { Level, LevelMode } from './Level';

export interface SpawnEntrant {
  readonly isPlayer: boolean;
}

/**
 * Seeded per-Round starting placements.
 *
 * Kept pure and exported so the real Match spawn path can be tested without a
 * WebGL renderer. Game only owns the mount and the renderer; this function owns
 * where each Tumbler begins.
 */
export function startPositionsFor(
  level: Level,
  mode: LevelMode,
  entrants: readonly SpawnEntrant[],
  seed: number,
): Vector3[] {
  const count = Math.max(1, entrants.length);
  const origin = level.startPosition;
  const y = origin.y + 0.02;
  const rng = new Rng((seed ^ (mode.length * 0x9e3779b1) ^ count) >>> 0);

  // Arena rounds expose perches. The centre perch is the authored safe start
  // (Hexapop's 3.4 s podium); it must belong to the human, never be sorted away
  // by geometry. Remaining perches fan toward the camera for a readable pack.
  if (level.spawnPoints) {
    const perches = level.spawnPoints(count).map((point) => point.clone());
    if (perches.length >= count) {
      const playerIndex = entrants.findIndex((entrant) => entrant.isPlayer);
      if (playerIndex < 0) return perches.sort((a, b) => b.z - a.z || b.x - a.x).slice(0, count);

      let centreIndex = 0;
      let centreDistance = Infinity;
      for (let index = 0; index < perches.length; index += 1) {
        const perch = perches[index]!;
        const distance = (perch.x - origin.x) ** 2 + (perch.z - origin.z) ** 2;
        if (distance < centreDistance) {
          centreDistance = distance;
          centreIndex = index;
        }
      }
      const [centre] = perches.splice(centreIndex, 1);
      const rest = perches.sort((a, b) => b.z - a.z || b.x - a.x).slice(0, count - 1);
      const positions: Vector3[] = [];
      for (let index = 0; index < count; index += 1) {
        const perch = index === playerIndex ? centre : rest.shift();
        positions.push(perch ?? centre ?? origin.clone().setY(y));
      }
      return positions;
    }
  }

  const positions: Vector3[] = [];
  if (mode === 'course' || mode === 'training') {
    // Player at the back-centre of the start deck; the pack forms three rows
    // ahead. The follow camera starts behind the player and sees the show.
    positions.push(new Vector3(origin.x, y, origin.z + 1.8));
    const columns = 5;
    for (let i = 1; i < count; i += 1) {
      const index = i - 1;
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = (column - (columns - 1) / 2) * 1.65 + rng.float(-0.12, 0.12);
      const z = origin.z - 0.35 - row * 1.65 + rng.float(-0.12, 0.12);
      positions.push(new Vector3(x, y, z));
    }
    return positions;
  }

  if (mode === 'crown-climb') {
    // The authored start is on the deck edge. Keep the player there and fan
    // the finalists toward the tower, all within the deck radius.
    positions.push(origin.clone().setY(y));
    const startAngle = Math.atan2(origin.z, origin.x);
    for (let i = 1; i < count; i += 1) {
      const angle = startAngle - (i / Math.max(1, count - 1)) * 1.35;
      positions.push(new Vector3(Math.cos(angle) * 4.2, y, Math.sin(angle) * 4.2));
    }
    return positions;
  }

  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const radius = i === 0 ? 0 : 2.2;
    positions.push(
      new Vector3(origin.x + Math.cos(angle) * radius, y, origin.z + Math.sin(angle) * radius),
    );
  }
  return positions;
}
