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
    timeLimit: 49.9,
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

export interface ResolveRoundOptions {
  /**
   * The Round clock expired rather than the win condition being met. On a
   * Course timeout only finishers may advance; living runners still on the
   * course are not qualifiers just because they did not fall.
   */
  timedOut?: boolean;
}

/**
 * Resolve one Round into a full placement table.
 *
 * Ranking rules (SPEC §4):
 * - Finishers always rank above non-finishers, ordered by finish time.
 * - Every living entrant ranks above every eliminated entrant, then by the
 *   Round's progress metric. A fallen Tumbler can no longer outrank a runner.
 * - If fewer living entrants remain than qualifier slots, all of them advance.
 *   The field gets smaller; the show continues with whoever is left.
 * - On a Course timeout only finishers advance. A living non-finisher never
 *   fills a slot, even at 0% with the clock at zero.
 * - Only when zero living entrants remain do the best eliminated rows fill the
 *   remaining slots (last out first). That is the mass-wipe fallback and is the
 *   only path that can label an eliminated performance QUALIFIED.
 *
 * Tie-break order per mode:
 * - Course: finish time; then progress; eliminated rows by last out, progress, id.
 * - Hexapop: survivor height, distance to centre, id; eliminated by last out.
 * - Crown Climb: crown winner, living height, horizontal distance, id.
 */
export function resolveRound(
  definition: RoundDefinition,
  performances: readonly RoundPerformance[],
  options: ResolveRoundOptions = {},
): RoundPlacement[] {
  const ordered = [...performances].sort((a, b) => compareForRound(definition, a, b));
  const slots = Math.min(definition.qualifiers, ordered.length);
  const living = ordered.filter((entry) => !entry.eliminated || entry.finishTime !== null);
  const qualified = new Set<string>();

  if (options.timedOut && definition.mode === 'course') {
    // Course win condition is "top finishers", not "top survivors". A bean
    // still jogging at 0% when the 120 s clock expires has not qualified.
    const finishers = ordered.filter((entry) => entry.finishTime !== null);
    if (finishers.length > 0) {
      // Fewer than the authored slots is legal: the next Round starts with a
      // smaller field. Never backfill with a living non-finisher.
      for (const entry of finishers.slice(0, slots)) qualified.add(entry.id);
    } else {
      // Nobody finished. The only legal field is the last beans eliminated by
      // elimination order (the mass-wipe fallback), never a living 0% bean.
      for (const entry of ordered.filter((entry) => entry.eliminated).slice(0, slots)) {
        qualified.add(entry.id);
      }
    }
  } else if (living.length >= slots) {
    for (const entry of living.slice(0, slots)) qualified.add(entry.id);
  } else if (living.length > 0) {
    // Mass elimination: everyone still standing advances, even if that leaves
    // fewer qualifiers than the authored slot count.
    for (const entry of living) qualified.add(entry.id);
  } else {
    // A total wipe: the last eliminated Tumblers fill the show so it can end.
    for (const entry of ordered.slice(0, slots)) qualified.add(entry.id);
  }

  return ordered.map((entry, index) => {
    const isQualified = qualified.has(entry.id);
    return {
      ...entry,
      placement: index + 1,
      qualified: isQualified,
      status: isQualified ? 'QUALIFIED' : 'ELIMINATED',
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
  const aFinished = a.finishTime !== null;
  const bFinished = b.finishTime !== null;
  if (aFinished || bFinished) {
    if (aFinished && bFinished) {
      return (a.finishTime as number) - (b.finishTime as number) || a.id.localeCompare(b.id);
    }
    return aFinished ? -1 : 1;
  }

  // Living runners rank above every fallen Tumbler, regardless of how far the
  // fallen one got before they left the course.
  if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
  if (!a.eliminated) {
    return b.progress - a.progress || a.id.localeCompare(b.id);
  }
  // Fallback order: last out is the best eliminated row, then progress and a
  // stable reverse id so a simultaneous wipe is deterministic (the human id 0
  // is last, never silently promoted by a tie).
  const eliminationOrder = (b.eliminatedAt ?? 0) - (a.eliminatedAt ?? 0);
  if (eliminationOrder !== 0) return eliminationOrder;
  if (a.progress !== b.progress) return b.progress - a.progress;
  return b.id.localeCompare(a.id);
}

function compareHexapop(a: RoundPerformance, b: RoundPerformance): number {
  if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
  if (!a.eliminated) {
    return b.height - a.height || a.distanceToCrown - b.distanceToCrown || a.id.localeCompare(b.id);
  }
  const eliminationOrder = (b.eliminatedAt ?? 0) - (a.eliminatedAt ?? 0);
  if (eliminationOrder !== 0) return eliminationOrder;
  return b.height - a.height || b.id.localeCompare(a.id);
}

function compareCrown(a: RoundPerformance, b: RoundPerformance): number {
  if (a.won !== b.won) return a.won ? -1 : 1;
  if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
  return b.height - a.height || a.distanceToCrown - b.distanceToCrown || a.id.localeCompare(b.id);
}

/** The number of qualifiers still needed, useful for HUD copy and tests. */
export function qualifiersRemaining(
  definition: RoundDefinition,
  qualified: number,
): number {
  return Math.max(0, definition.qualifiers - qualified);
}
