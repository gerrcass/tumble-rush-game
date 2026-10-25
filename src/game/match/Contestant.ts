import { Vector3 } from 'three';
import { Bean } from '../player/Bean';
import { BeanController } from '../player/BeanController';
import { BeanBody } from '../physics/BeanBody';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { Scene } from 'three';
import type { BeanLook, ColorId, HatId, PatternId } from '../cosmetics';
import { PLAYER_LOOK } from '../cosmetics';
import { Rng } from '../Rng';
import { clamp } from '../util/math';
import { DIFFICULTY_PRESETS, type DifficultyPreset } from './Director';
import type { BotBrain } from '../bots/BotBrain';

export type ContestantStatus =
  | 'waiting'
  | 'racing'
  | 'qualified'
  | 'eliminated'
  | 'spectating';

export interface BotProfile {
  name: string;
  look: BeanLook;
  baseSkill: number;
  baseReaction: number;
  baseAggression: number;
  baseMistakeChance: number;
}

interface ContestantOptions {
  id: number;
  name: string;
  look: BeanLook;
  isPlayer: boolean;
  world: PhysicsWorld;
  scene: Scene;
  outline: boolean;
  phase: number;
  skill?: number;
  reaction?: number;
  aggression?: number;
  mistakeChance?: number;
}

/**
 * One Tumbler in the Show: a BeanBody (physics), a Bean (presentation), and a
 * BeanController (intent). Bots and the player are the same object type; the
 * only difference is who fills the ControllerFrame.
 */
export class Contestant {
  readonly id: number;
  readonly name: string;
  readonly look: BeanLook;
  readonly isPlayer: boolean;
  readonly body: BeanBody;
  readonly bean: Bean;
  readonly controller: BeanController;

  brain: BotBrain | null = null;

  baseSkill: number;
  baseReaction: number;
  baseAggression: number;
  baseMistakeChance: number;
  skill: number;
  reaction: number;
  aggression: number;
  mistakeChance: number;

  status: ContestantStatus = 'waiting';
  placement: number | null = null;
  finishTime: number | null = null;
  eliminatedAt: number | null = null;
  progress = 0;
  height = 0;
  distanceToCrown = 0;
  lane = 0;
  /** Fingerprint for the current mental target, for debug only. */
  targetLabel = '';

  constructor(options: ContestantOptions) {
    this.id = options.id;
    this.name = options.name;
    this.look = options.look;
    this.isPlayer = options.isPlayer;
    this.baseSkill = options.skill ?? 1;
    this.baseReaction = options.reaction ?? 0.16;
    this.baseAggression = options.aggression ?? 0;
    this.baseMistakeChance = options.mistakeChance ?? 0;
    this.skill = this.baseSkill;
    this.reaction = this.baseReaction;
    this.aggression = this.baseAggression;
    this.mistakeChance = this.baseMistakeChance;

    this.body = new BeanBody({ position: new Vector3() });
    options.world.addBody(this.body);
    this.bean = new Bean({
      look: options.look,
      outline: options.outline,
      name: options.name,
      phase: options.phase,
    });
    options.scene.add(this.bean.group);
    this.controller = new BeanController(this.body, options.world);
  }

  applyDifficulty(preset: DifficultyPreset): void {
    if (this.isPlayer) return;
    this.skill = clamp(this.baseSkill + preset.skill, 0.25, 1);
    this.reaction = clamp(this.baseReaction + preset.reaction, 0.08, 0.55);
    this.aggression = clamp(this.baseAggression * preset.aggression, 0, 1);
    this.mistakeChance = clamp(this.baseMistakeChance * preset.mistake, 0.005, 0.25);
  }

  /** Prepare this Tumbler for a Round at a seeded start position. */
  resetForRound(position: Vector3, lane: number, status: ContestantStatus): void {
    this.body.reset(position.x, position.y, position.z);
    this.controller.reset();
    this.bean.setVisible(true);
    this.bean.setMenuMode(false);
    this.status = status;
    this.placement = null;
    this.finishTime = null;
    this.eliminatedAt = null;
    this.progress = 0;
    this.height = position.y;
    this.distanceToCrown = 0;
    this.lane = lane;
    this.targetLabel = '';
    this.brain?.reset();
  }

  hide(): void {
    this.body.eliminated = true;
    this.bean.setVisible(false);
  }

  updateProgress(levelProgress: number): void {
    this.progress = clamp(levelProgress, 0, 1);
  }

  get position(): Vector3 {
    return this.body.position;
  }

  get speed(): number {
    return Math.hypot(this.body.velocity.x, this.body.velocity.z);
  }

  dispose(): void {
    this.controller.reset();
    this.bean.dispose();
    this.body.eliminated = true;
  }
}

interface RosterEntry {
  name: string;
  colorId: ColorId;
  patternId: PatternId;
  hatId: HatId;
}

/**
 * Fifteen original pun names with looks drawn from the existing cosmetic
 * catalogue. Every look is a distinct colour / pattern / hat combination so
 * the pack reads at gameplay distance even with name tags off.
 */
export const BOT_ROSTER: readonly RosterEntry[] = [
  { name: 'Mochi Mayhem', colorId: 'bubblegum', patternId: 'dots', hatId: 'ducky' },
  { name: 'Sir Flopsalot', colorId: 'sky', patternId: 'stripes', hatId: 'crown' },
  { name: 'Tumbleweed', colorId: 'mango', patternId: 'zigzag', hatId: 'cone' },
  { name: 'Wobble Watson', colorId: 'mint', patternId: 'checker', hatId: 'antenna' },
  { name: 'Beanadette', colorId: 'grape', patternId: 'stars', hatId: 'flower' },
  { name: 'Flip McChip', colorId: 'coral', patternId: 'solid', hatId: 'propeller' },
  { name: 'Jelly Jolene', colorId: 'midnight', patternId: 'dots', hatId: 'halo' },
  { name: 'Bounce Barry', colorId: 'cream', patternId: 'checker', hatId: 'ducky' },
  { name: 'Dizzy Dottie', colorId: 'sky', patternId: 'zigzag', hatId: 'propeller' },
  { name: 'Custard Cobra', colorId: 'mango', patternId: 'solid', hatId: 'antenna' },
  { name: "Puddin' Pop", colorId: 'grape', patternId: 'dots', hatId: 'crown' },
  { name: "Slip n' Slide", colorId: 'mint', patternId: 'stripes', hatId: 'cone' },
  { name: 'Gummy Bearwin', colorId: 'bubblegum', patternId: 'stars', hatId: 'flower' },
  { name: 'Jiggle Jim', colorId: 'midnight', patternId: 'stripes', hatId: 'halo' },
  { name: 'Marshmallow Drop', colorId: 'cream', patternId: 'zigzag', hatId: 'ducky' },
];

/** Build the 15 bot personalities for one Show from the show seed. */
export function createBotProfiles(seed: number): BotProfile[] {
  const rng = new Rng((seed ^ 0xb075) >>> 0);
  return BOT_ROSTER.map((entry) => {
    // Three draws averaged pulls skill toward the middle without flattening
    // the pack: a couple of stars, a couple of hopeless optimists.
    const weight = (rng.next() + rng.next() + rng.next()) / 3;
    return {
      name: entry.name,
      look: { colorId: entry.colorId, patternId: entry.patternId, hatId: entry.hatId },
      baseSkill: 0.45 + weight * 0.5,
      baseReaction: rng.float(0.12, 0.38),
      baseAggression: rng.float(0, 1),
      baseMistakeChance: rng.float(0.02, 0.12),
    };
  });
}

export function playerLook(): BeanLook {
  return { ...PLAYER_LOOK };
}

export function applyPresetToAll(
  contestants: readonly Contestant[],
  presetId: keyof typeof DIFFICULTY_PRESETS,
): void {
  const preset = DIFFICULTY_PRESETS[presetId];
  for (const contestant of contestants) contestant.applyDifficulty(preset);
}
