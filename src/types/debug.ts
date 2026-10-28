import type { GameState } from '../game/Game';
import type { LevelMode, LevelStatus, Quality, WaypointAction } from '../game/levels/Level';
import type { DifficultyId, RoundPlacement, ShowPhase } from '../game/match/Director';
import type { AudioDebugState, SfxName } from '../game/audio/AudioEngine';

export interface DebugRenderInfo {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  particles: number;
}

export interface DebugWaypoint {
  x: number;
  y: number;
  z: number;
  action: WaypointAction;
  radius: number;
}

export interface DebugContestantStatus {
  id: number;
  name: string;
  status: string;
  eliminated: boolean;
  placement: number | null;
}

export interface DebugContestantPosition {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  target?: string;
  grounded?: boolean;
  vy?: number;
}

export interface DebugStanding {
  id: number;
  name: string;
  isPlayer: boolean;
  status: string;
  progress: number;
  placement: number | null;
}

export interface DebugContestants {
  count: number;
  names: string[];
  statuses: DebugContestantStatus[];
  positions: DebugContestantPosition[];
  standings: DebugStanding[];
  player: string;
}

export interface DebugShow {
  active: boolean;
  phase: ShowPhase | null;
  roundIndex: number;
  roundNumber: number;
  roundTitle: string;
  roundMode: LevelMode;
  time: number;
  qualified: number;
  qualifiers: number;
  remaining: number;
  spectating: boolean;
  seedLabel: string;
  difficulty: DifficultyId;
  winner: string | null;
}

export interface DebugCourse {
  laps: number;
  lapOffsetZ: number;
  lapOffsetY: number;
  length: number;
  finishZ: number;
  finishY: number;
  waypointCount: number;
  /** The two lap routes and the arena plan, for evidence and the gate. */
  routeLabel: string;
  courseSignature: string;
  arena: string;
  signature: string;
  showLabel: string;
}

export interface DebugShowPlan {
  courseSignature: string;
  lapRoutes: readonly (readonly string[])[];
  routeLabel: string;
  arena: string;
  arenaLabel: string;
  signature: string;
  label: string;
  twist: DebugTwistPlan;
}

export interface DebugTwistPlan {
  id: 'moon' | 'slippery' | 'rush';
  label: string;
  short: string;
  rule: string;
  accent: number;
}

/**
 * Live twist probe. `applied` is derived from the world's gravity and the
 * controller rule values, never from the plan alone, so a plan label cannot
 * silently lie about the physics.
 */
export interface DebugTwist {
  id: 'moon' | 'slippery' | 'rush' | 'classic';
  label: string;
  short: string;
  rule: string;
  gravity: number;
  frictionScale: number;
  sugarRushSeconds: number;
  sugarRushReached: boolean;
  applied: boolean;
  classic: boolean;
}

/** M2-005 spectate evidence: who the camera follows and what it can see. */
export interface DebugSpectate {
  active: boolean;
  name: string;
  seconds: number;
  camera: { x: number; y: number; z: number };
  leader: { x: number; y: number; z: number } | null;
  /** Lens-to-leader distance; the follow-cam should sit in the wide band. */
  leaderDistance: number;
  leaderTagVisible: boolean;
  nonTargetTagsVisible: number;
  /** Distance from the lens to the nearest living bean capsule centre. */
  nearestBeanClearance: number;
  /** Clearance above the Round's lethal surface. */
  slimeClearance: number;
}

/**
 * Test/debug surface exposed on window.__tumble in dev builds only. The old
 * phase-one/two hooks remain for physics and Round evidence; the show hooks
 * drive a complete Show without six minutes of wall-clock play.
 */
export interface TumbleDebugApi {
  readonly state: GameState;
  readonly seed: number;
  readonly seedLabel: string;
  readonly currentMode: LevelMode;
  readonly playerPos: { x: number; y: number; z: number };
  readonly cameraPos: { x: number; y: number; z: number };
  readonly velocity: { x: number; y: number; z: number };
  readonly grounded: boolean;
  readonly quality: Quality;
  readonly elapsed: number;
  readonly fps: number;
  readonly audio: AudioDebugState;
  readonly renderInfo: DebugRenderInfo;
  readonly tileCount: number;
  readonly slimeHeight: number;
  readonly crownPosition: { x: number; y: number; z: number };
  readonly levelStatus: LevelStatus;
  readonly eliminated: boolean;
  readonly winner: string | null;
  readonly waypoints: readonly DebugWaypoint[];
  readonly show: DebugShow;
  readonly contestants: DebugContestants;
  readonly roundPlacements: readonly RoundPlacement[];
  readonly autopilot: 'off' | 'casual';
  readonly course: DebugCourse | null;
  readonly plan: DebugShowPlan;
  readonly twist: DebugTwist;
  readonly spectate: DebugSpectate;
  setQuality: (quality: Quality) => void;
  teleport: (x: number, y: number, z: number) => void;
  startMode: (mode: LevelMode) => void;
  finishNow: () => void;
  startShow: (difficulty?: DifficultyId) => void;
  startObservedShow: (difficulty?: DifficultyId) => void;
  startCasualRun: (difficulty?: DifficultyId) => void;
  setPlayerAutopilot: (mode: 'off' | 'casual') => void;
  eliminateContestant: (name: string) => void;
  isAtFinish: (x: number, y: number, z: number) => boolean;
  startPractice: (mode?: LevelMode) => void;
  beginRound: () => void;
  finishRound: () => void;
  nextRound: () => void;
  jumpToRound: (index: number) => void;
  simulate: (seconds: number) => { steps: number; phase: string; round: number };
  setDifficulty: (difficulty: DifficultyId) => void;
  forcePlayerWin: () => void;
  skipSpectate: () => void;
  setCamera: (yaw: number, pitch: number, distance: number) => void;
  lookAt: (x: number, y: number, z: number) => void;
  clearLookAt: () => void;
  playSfx: (name: SfxName) => boolean;
  unlockAudio: () => void;
}
