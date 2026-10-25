import type { Level, LevelMode } from './Level';
import { MODE_CATALOGUE } from './Level';
import { TrainingDeck } from './TrainingDeck';
import { Course } from './Course';
import { Hexapop } from './Hexapop';
import { CrownClimb } from './CrownClimb';

/**
 * Single place that knows how to build every Round. Game switches Rounds by
 * disposing the old Level and asking the factory for a new one with the same
 * show seed, so a seed always reproduces the same Course.
 */
export function createLevel(mode: LevelMode, seed: number): Level {
  switch (mode) {
    case 'training':
      return new TrainingDeck(seed);
    case 'course':
      return new Course(seed);
    case 'hexapop':
      return new Hexapop(seed);
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
