import type { Group, Vector3 } from 'three';
import type { BeanBody } from '../physics/BeanBody';
import type { Collider } from '../physics/Collider';

/** Renderer preset shared by every Level. */
export type Quality = 'high' | 'low';

/** The four playable Rounds in phase two. */
export type LevelMode = 'training' | 'course' | 'hexapop' | 'crown-climb';

export const LEVEL_MODES: readonly LevelMode[] = [
  'training',
  'course',
  'hexapop',
  'crown-climb',
];

export interface Checkpoint {
  position: Vector3;
  minZ?: number;
  maxZ?: number;
  maxY?: number;
}

/**
 * Bots need an authored route, not a screenshot. Waypoints are exposed by
 * every Level now so phase three can drive the same physics bodies through the
 * exact route the player sees. `action` describes what the bot should attempt
 * on arrival; `radius` is the acceptance distance.
 */
export type WaypointAction = 'run' | 'jump' | 'dive' | 'ride';

export interface Waypoint {
  position: Vector3;
  action: WaypointAction;
  radius: number;
  /** Optional lane index for course grammar. */
  lane?: number;
}

export type LevelTileState = 'idle' | 'warning' | 'falling' | 'gone';

/**
 * A public, read-only snapshot of one Hexapop tile. Bots use the same query a
 * future spectator UI would: no private state leaks, no mutation.
 */
export interface LevelTile {
  x: number;
  y: number;
  z: number;
  tier: number;
  ring: number;
  state: LevelTileState;
  /** Seconds left before a warning tile drops, 0 when it is not warning. */
  warning: number;
  safe: boolean;
}

export type LevelResultKind = 'finish' | 'crown' | 'survived' | 'timeout' | 'eliminated';

/** The one-shot outcome the Game turns into an end overlay. */
export interface LevelResult {
  kind: LevelResultKind;
  title: string;
  detail: string;
  time: number;
  /** Filled in by Game so end overlays can name the Round. */
  roundTitle?: string;
  /** Name of the winner when one exists (Crown Climb). */
  winner: string | null;
}

/** Everything the HUD needs. Levels own the numbers; the Game owns the timer. */
export interface LevelStatus {
  mode: LevelMode;
  title: string;
  objective: string;
  elapsed: number;
  timeLimit: number;
  /** 0..1 along the level's own objective axis. */
  progress: number;
  progressLabel: string;
  metricLabel: string;
  metricValue: string;
  /** SHOWTIME, SUGAR RUSH, ASCENT, … */
  phase: string;
  result: LevelResult | null;
}

/**
 * The shared contract between Game and every Round.
 *
 * A Level builds geometry and colliders, advances its own kinematic hazards at
 * the fixed rate, reports objective data, and disposes everything it created.
 * It never owns Game state, the renderer, or the player body: the Game resets
 * and reads bodies, and PhysicsWorld is the only system that integrates them.
 */
export interface Level {
  readonly mode: LevelMode;
  readonly title: string;
  readonly objective: string;
  readonly group: Group;
  readonly colliders: Collider[];
  readonly startPosition: Vector3;
  readonly checkpoints: readonly Checkpoint[];
  readonly respawnAllowed: boolean;
  /** Dynamic kill plane; Crown Climb raises it with the slime. */
  readonly killY: number;
  readonly finishPosition: Vector3;
  readonly waypoints: readonly Waypoint[];
  /** Lowest safe camera height for this space. */
  readonly cameraFloor: number;

  /** Fixed-rate update. Called before PhysicsWorld.step(). */
  step(dt: number, bodies: readonly BeanBody[]): void;

  /** Render-rate dressing animation. */
  animate(elapsed: number, dt: number): void;

  /** Return hazards/platforms to their authored start pose. */
  resetKinematics(): void;

  checkpointFor(position: Vector3, current: number): number;

  setQuality(quality: Quality): void;

  /** 0..1 objective progress for the HUD and the show director. */
  progress(position: Vector3): number;

  /** The finish trigger: gate, crown, or a mode that has no spatial finish. */
  isAtFinish(position: Vector3): boolean;

  status(): LevelStatus;

  /** The result this level would report if the Round ended right now. */
  finishNow(): LevelResult;

  dispose(): void;

  // Optional mode-specific debug/phase-three data.
  readonly tileCount?: number;
  readonly slimeHeight?: number;
  readonly crownPosition?: Vector3;
  readonly winner?: string | null;
  /** Hexapop's live Sugar Rush start (classic 45, RUSH HOUR 38). */
  readonly sugarRushSeconds?: number;
  /** True once the Sugar Rush wave has begun in the live Round. */
  readonly sugarRushReached?: boolean;

  /** Hexapop's public tile query. Bots and tests read the same snapshot. */
  queryTiles?(): readonly LevelTile[];
  /** Nearest tile that is safe to land on, or null when the floor is gone. */
  nearestSafeTile?(position: Vector3): LevelTile | null;
  /** Seeded start perches inside the Round's start area, spread apart. */
  spawnPoints?(count: number): readonly Vector3[];
  /**
   * Bot-friendly side lane (magnitude) around low hurdles. Zero elsewhere.
   * Lets the AI take the authored run-around choice without seeing colliders.
   */
  hurdleLane?(z: number): number;
}

export interface ModeCatalogueEntry {
  mode: LevelMode;
  label: string;
  tagline: string;
  objective: string;
  respawnAllowed: boolean;
}

/** Human-facing copy for the temporary phase-two mode selector. */
export const MODE_CATALOGUE: Readonly<Record<LevelMode, ModeCatalogueEntry>> = {
  training: {
    mode: 'training',
    label: 'TRAINING DECK',
    tagline: 'Learn the wobble',
    objective: 'Reach the finish gate',
    respawnAllowed: true,
  },
  course: {
    mode: 'course',
    label: 'SUNRISE SCRAMBLE',
    tagline: 'Five sections, one gate',
    objective: 'Race through the gate',
    respawnAllowed: false,
  },
  hexapop: {
    mode: 'hexapop',
    label: 'HEXAPOP',
    tagline: 'Do not trust the floor',
    objective: 'Survive the Sugar Rush',
    respawnAllowed: false,
  },
  'crown-climb': {
    mode: 'crown-climb',
    label: 'CROWN CLIMB',
    tagline: 'Up is the only way',
    objective: 'Touch the crown',
    respawnAllowed: false,
  },
};

export function isLevelMode(value: string): value is LevelMode {
  return (LEVEL_MODES as readonly string[]).includes(value);
}
