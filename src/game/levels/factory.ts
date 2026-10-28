import type { Level, LevelMode } from './Level';
import { MODE_CATALOGUE } from './Level';
import { TrainingDeck } from './TrainingDeck';
import { Course } from './Course';
import { Hexapop } from './Hexapop';
import { CrownClimb } from './CrownClimb';
import type { TwistRules } from '../twist';

/**
 * Single place that knows how to build every Round. Game switches Rounds by
 * disposing the old Level and asking the factory for a new one with the same
 * show seed, so a seed always reproduces the same Course.
 */
export interface LevelOptions {
  /**
   * The menu diorama is a classic preview, so it omits the twist sign: the
   * Daily chip owns the twist identity there. Real Course/Practice starts keep
   * the sign.
   */
  showTwistSign?: boolean;
  /** The resolved rules installed in the world/controllers for this level. */
  rules?: TwistRules;
}

export function createLevel(
  mode: LevelMode,
  seed: number,
  options: LevelOptions = {},
): Level {
  switch (mode) {
    case 'training':
      return new TrainingDeck(seed);
    case 'course':
      return new Course(seed, {
        showTwistSign: options.showTwistSign !== false,
        rules: options.rules,
      });
    case 'hexapop':
      return new Hexapop(seed, { rules: options.rules });
    case 'crown-climb':
      return new CrownClimb(seed);
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unknown level mode: ${String(exhaustive)}`);
    }
  }
}

export function levelModeLabel(mode: LevelMode): string {
  return MODE_CATALOGUE[mode].label;
}

export function levelModeTagline(mode: LevelMode): string {
  return MODE_CATALOGUE[mode].tagline;
}
