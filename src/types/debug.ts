import type { GameState } from '../game/Game';
import type { Quality } from '../game/levels/TrainingDeck';

/** Test/debug surface exposed on window.__tumble in dev builds only. */
export interface TumbleDebugApi {
  readonly state: GameState;
  readonly seed: number;
  readonly playerPos: { x: number; y: number; z: number };
  readonly cameraPos: { x: number; y: number; z: number };
  readonly velocity: { x: number; y: number; z: number };
  readonly grounded: boolean;
  readonly quality: Quality;
  readonly elapsed: number;
  readonly fps: number;
  setQuality: (quality: Quality) => void;
  teleport: (x: number, y: number, z: number) => void;
}
