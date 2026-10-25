import type { GameState } from '../game/Game';
import type { LevelMode, LevelStatus, Quality, WaypointAction } from '../game/levels/Level';
import type { DifficultyId, RoundPlacement, ShowPhase } from '../game/match/Director';

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
  time: number;
  qualified: number;
  qualifiers: number;
  remaining: number;
  spectating: boolean;
  seedLabel: string;
  difficulty: DifficultyId;
  winner: string | null;
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
  setQuality: (quality: Quality) => void;
  teleport: (x: number, y: number, z: number) => void;
  startMode: (mode: LevelMode) => void;
  finishNow: () => void;
  startShow: (difficulty?: DifficultyId) => void;
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
}
