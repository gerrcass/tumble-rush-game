import type { GameState } from '../game/Game';
import type { LevelMode, LevelStatus, Quality, WaypointAction } from '../game/levels/Level';

export interface DebugWaypoint {
  x: number;
  y: number;
  z: number;
  action: WaypointAction;
  radius: number;
}

/**
 * Test/debug surface exposed on window.__tumble in dev builds only.
 * `startMode`, `finishNow`, `setCamera` and `lookAt` are the phase-two evidence
 * hooks; `waypoints` is the phase-three bot route.
 */
export interface TumbleDebugApi {
  readonly state: GameState;
  readonly seed: number;
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
  setQuality: (quality: Quality) => void;
  teleport: (x: number, y: number, z: number) => void;
  startMode: (mode: LevelMode) => void;
  finishNow: () => void;
  setCamera: (yaw: number, pitch: number, distance: number) => void;
  lookAt: (x: number, y: number, z: number) => void;
  clearLookAt: () => void;
}
