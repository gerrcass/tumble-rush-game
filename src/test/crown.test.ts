import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createLevel } from '../game/levels/factory';
import {
  CROWN_TOUCH_RADIUS,
  CROWN_Y,
  type CrownClimb,
} from '../game/levels/CrownClimb';
import { BEAN_HEIGHT } from '../game/physics/BeanBody';
import { CROWN_PHYSICAL, touchesCrown } from '../../scripts/lib/pacing.mjs';

const STANDING_Y = 48.4;

function crownLevel(seed = 20260418): CrownClimb {
  return createLevel('crown-climb', seed) as CrownClimb;
}

describe('Crown Climb physical crown contact', () => {
  it('keeps the game and pacing-harness contact geometry in sync', () => {
    expect(CROWN_Y).toBe(CROWN_PHYSICAL.centerY);
    expect(CROWN_TOUCH_RADIUS).toBeCloseTo(
      CROWN_PHYSICAL.bandRadius + CROWN_PHYSICAL.beanRadius,
      6,
    );
    expect(BEAN_HEIGHT).toBe(CROWN_PHYSICAL.beanHeight);
  });

  it('credits a bean standing on the dais under the lowered crown', () => {
    const level = crownLevel();
    expect(level.isAtFinish(new Vector3(0, STANDING_Y, 0))).toBe(true);
    // The old dais-proximity trigger accepted this edge; the crown band does
    // not reach it, so it must be a no.
    expect(level.isAtFinish(new Vector3(0, STANDING_Y, 2.95))).toBe(false);
    expect(level.isAtFinish(new Vector3(0, 30, 0))).toBe(false);
    expect(level.isAtFinish(new Vector3(0, 8, 0))).toBe(false);
  });

  it('finishes the level only on the physical touch, not dais proximity', () => {
    const level = crownLevel();
    const body = {
      position: new Vector3(0, STANDING_Y, 2.95),
      eliminated: false,
    } as never;
    level.step(1 / 60, [body]);
    expect(level.status().result).toBeNull();

    const winner = {
      position: new Vector3(0, STANDING_Y, 0),
      eliminated: false,
    } as never;
    level.step(1 / 60, [winner]);
    expect(level.status().result?.kind).toBe('crown');
    expect(level.winner).toBe('YOU');
  });

  it('derives the harness touch flag from height and horizontal distance', () => {
    expect(
      touchesCrown({ finishTime: 50, height: STANDING_Y, distanceToCrown: 0 }),
    ).toBe(true);
    expect(
      touchesCrown({ finishTime: 50, height: STANDING_Y, distanceToCrown: 2.95 }),
    ).toBe(false);
    // The committed total-wipe shape: finishTime null, 19% height, far away.
    expect(
      touchesCrown({ finishTime: null, height: 9.17, distanceToCrown: 8.86 }),
    ).toBe(false);
  });
});
