import type { LevelMode } from '../levels/Level';

/** The public phases of a Show. `menu` is owned by the App shell. */
export type ShowPhase = 'intro' | 'countdown' | 'playing' | 'results' | 'victory' | 'defeat';

export type DifficultyId = 'chill' | 'show' | 'champion';

export interface DifficultyPreset {
  id: DifficultyId;
  label: string;
  blurb: string;
  skill: number;
  reaction: number;
  mistake: number;
  aggression: number;
}

/**
 * Difficulty scales bot personality only. The player's maximum speed and
 * physics are never changed; hazard speed is deliberately left alone so the
 * authored Course and Crown Climb timing stay honest.
 */
export const DIFFICULTY_PRESETS: Readonly<Record<DifficultyId, DifficultyPreset>> = {
  chill: {
    id: 'chill',
    label: 'CHILL',
    blurb: 'Bots take it easy',
    skill: -0.16,
    reaction: 0.09,
    mistake: 1.55,
    aggression: 0.55,
  },
  show: {
    id: 'show',
    label: 'SHOW',
    blurb: 'A fair fight',
    skill: 0,
    reaction: 0,
    mistake: 1,
    aggression: 1,
  },
  champion: {
    id: 'champion',
    label: 'CHAMPION',
    blurb: 'They came to win',
    skill: 0.13,
    reaction: -0.06,
    mistake: 0.55,
    aggression: 1.45,
  },
};

export interface RoundDefinition {
  index: number;
  mode: LevelMode;
  label: string;
  objective: string;
  starters: number;
  qualifiers: number;
  timeLimit: number;
  /** HUD label for the thing being ranked this Round. */
  metric: string;
}

/** The three-Round Show contract. */
export const SHOW_ROUNDS: readonly RoundDefinition[] = [
  {
    index: 0,
    mode: 'course',
    label: 'SUNRISE SCRAMBLE',
    objective: 'Race through the Finish Gate',
    starters: 16,
    qualifiers: 8,
    timeLimit: 120,
    metric: 'FINISH',
  },
  {
    index: 1,
    mode: 'hexapop',
    label: 'HEXAPOP',
    objective: 'Survive the Sugar Rush',
    starters: 8,
    qualifiers: 4,
    timeLimit: 75,
    metric: 'LAST TILES',
  },
  {
    index: 2,
    mode: 'crown-climb',
    label: 'CROWN CLIMB',
    objective: 'Touch the crown',
    starters: 4,
    qualifiers: 1,
    timeLimit: 120,
    metric: 'HEIGHT',
  },
];

/**
 * What the Director needs to know about one Tumbler at the end of a Round.
 * This is a plain record: no beans, no Three.js, no profile.
 */
export interface RoundPerformance {
  id: string;
  name: string;
  isPlayer: boolean;
  finishTime: number | null;
  progress: number;
  eliminated: boolean;
  eliminatedAt: number | null;
  won: boolean;
  height: number;
  distanceToCrown: number;
}

export interface RoundPlacement extends RoundPerformance {
  placement: number;
  qualified: boolean;
  status: 'QUALIFIED' | 'ELIMINATED';
}

/**
 * Resolve one Round into a full placement table with exactly
 * `definition.qualifiers` QUALIFIED rows.
 *
 * Tie-break order is explicit per Round:
 * - Course: finish time, then progress, then last-eliminated, then id. A
 *   fallen human never takes a fallback qualifier slot.
 * - Hexapop: survivor height, then distance to the arena centre, then id;
 *   fallen Tumblers rank by elimination time (last out is best).
 * - Crown Climb: crown winner, then height, then horizontal distance to the
 *   crown, then id.
 *
 * If fewer Tumblers meet the advancement condition than there are slots (a
 * mass wipe), the best eliminated entrants fill the remaining qualifier slots.
 * A Show therefore always continues with the correct field size.
 */
export function resolveRound(
  definition: RoundDefinition,
  performances: readonly RoundPerformance[],
): RoundPlacement[] {
  const ordered = [...performances].sort((a, b) => compareForRound(definition, a, b));
  const slots = Math.min(definition.qualifiers, ordered.length);
  return ordered.map((entry, index) => {
    const qualified = index < slots;
    return {
      ...entry,
      placement: index + 1,
      qualified,
      status: qualified ? 'QUALIFIED' : 'ELIMINATED',
    };
  });
}

function compareForRound(
  definition: RoundDefinition,
  a: RoundPerformance,
  b: RoundPerformance,
): number {
  switch (definition.mode) {
    case 'course':
      return compareCourse(a, b);
    case 'hexapop':
      return compareHexapop(a, b);
    case 'crown-climb':
      return compareCrown(a, b);
    case 'training':
    default:
      return a.id.localeCompare(b.id);
  }
}

function compareCourse(a: RoundPerformance, b: RoundPerformance): number {
  if (a.finishTime !== null && b.finishTime !== null) {
    return a.finishTime - b.finishTime || a.id.localeCompare(b.id);
  }
  if (a.finishTime !== null) return -1;
  if (b.finishTime !== null) return 1;

  // A fallen human is out of the Show even if their last progress number is
  // high; 15 bots always leave enough fallback rows to fill qualifier slots.
  if (a.isPlayer && a.eliminated) return 1;
  if (b.isPlayer && b.eliminated) return -1;

  // Progress decides first. An idle Tumbler at the start must never outrank a
  // bot that actually ran further just because the idle one is still standing.
  if (a.progress !== b.progress) return b.progress - a.progress;
  if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
  if (a.eliminated) {
    // The human never rides a mass-wipe fallback into a later Round.
    if (a.isPlayer !== b.isPlayer) return a.isPlayer ? 1 : -1;
    const eliminationOrder = (b.eliminatedAt ?? 0) - (a.eliminatedAt ?? 0);
    if (eliminationOrder !== 0) return eliminationOrder;
  }
  return a.id.localeCompare(b.id);
}

function compareHexapop(a: RoundPerformance, b: RoundPerformance): number {
  if (a.isPlayer && a.eliminated) return 1;
  if (b.isPlayer && b.eliminated) return -1;
  if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
  if (!a.eliminated) {
    return b.height - a.height || a.distanceToCrown - b.distanceToCrown || a.id.localeCompare(b.id);
  }
  const eliminationOrder = (b.eliminatedAt ?? 0) - (a.eliminatedAt ?? 0);
  if (eliminationOrder !== 0) return eliminationOrder;
  return b.height - a.height || a.id.localeCompare(b.id);
}

function compareCrown(a: RoundPerformance, b: RoundPerformance): number {
  if (a.won !== b.won) return a.won ? -1 : 1;
  return b.height - a.height || a.distanceToCrown - b.distanceToCrown || a.id.localeCompare(b.id);
}

/** The number of qualifiers still needed, useful for HUD copy and tests. */
export function qualifiersRemaining(
  definition: RoundDefinition,
  qualified: number,
): number {
  return Math.max(0, definition.qualifiers - qualified);
}
