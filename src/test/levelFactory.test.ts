import { describe, expect, it } from 'vitest';
import { createLevel } from '../game/levels/factory';
import { LEVEL_MODES, MODE_CATALOGUE, isLevelMode, type LevelMode } from '../game/levels/Level';
import { FIXED_STEP } from '../game/physics/PhysicsWorld';

describe('Level factory', () => {
  it('builds every mode with a complete contract', () => {
    for (const mode of LEVEL_MODES) {
      const level = createLevel(mode, 424242);
      expect(level.mode).toBe(mode);
      expect(level.title.length).toBeGreaterThan(0);
      expect(level.objective.length).toBeGreaterThan(0);
      expect(level.group.children.length).toBeGreaterThan(0);
      expect(level.colliders.length).toBeGreaterThan(0);
      expect(level.startPosition).toBeDefined();
      expect(level.finishPosition).toBeDefined();
      expect(level.waypoints.length).toBeGreaterThan(8);
      expect(level.cameraFloor).toBeLessThan(level.startPosition.y + 2);
      expect(level.checkpoints.length).toBeGreaterThan(0);

      const status = level.status();
      expect(status.mode).toBe(mode);
      expect(status.title).toBe(level.title);
      expect(status.progress).toBeGreaterThanOrEqual(0);
      expect(status.progress).toBeLessThanOrEqual(1);
      expect(status.metricLabel.length).toBeGreaterThan(0);
      expect(status.metricValue.length).toBeGreaterThan(0);
      expect(status.result).toBeNull();

      const progress = level.progress(level.startPosition);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);

      // The fixed-step contract and render dressing must both run headlessly.
      expect(() => level.step(FIXED_STEP, [])).not.toThrow();
      expect(() => level.animate(0.16, 0.016)).not.toThrow();
      expect(() => level.resetKinematics()).not.toThrow();
      expect(() => level.setQuality('low')).not.toThrow();
      expect(() => level.setQuality('high')).not.toThrow();

      level.dispose();
    }
  });

  it('reports the documented finish result for each mode', () => {
    const kinds: Record<LevelMode, string> = {
      training: 'finish',
      course: 'finish',
      hexapop: 'survived',
      'crown-climb': 'crown',
    };
    for (const mode of LEVEL_MODES) {
      const level = createLevel(mode, 7);
      expect(level.finishNow().kind).toBe(kinds[mode]);
      expect(level.finishNow().time).toBeGreaterThanOrEqual(0);
      level.dispose();
    }
  });

  it('exposes the mode-specific phase-two debug data', () => {
    const hex = createLevel('hexapop', 9);
    expect(hex.tileCount).toBe(223);
    expect(hex.slimeHeight).toBe(-9.5);
    hex.dispose();

    const climb = createLevel('crown-climb', 9);
    expect(climb.slimeHeight).toBeCloseTo(-2, 5);
    expect(climb.crownPosition?.y).toBeGreaterThan(45);
    expect(climb.killY).toBeCloseTo(-2, 5);
    climb.dispose();

    const course = createLevel('course', 9);
    expect(course.waypoints.length).toBeGreaterThanOrEqual(20);
    expect(course.isAtFinish(course.finishPosition)).toBe(true);
    expect(course.progress(course.finishPosition)).toBeCloseTo(1, 5);
    course.dispose();
  });

  it('reproduces the same Course plan from the same show seed', () => {
    const a = createLevel('course', 0xdecafbad);
    const b = createLevel('course', 0xdecafbad);
    expect(a.waypoints.map((point) => point.position.toArray())).toEqual(
      b.waypoints.map((point) => point.position.toArray()),
    );
    expect(a.colliders.length).toBe(b.colliders.length);
    a.dispose();
    b.dispose();
  });

  it('exposes catalogue copy and a mode guard', () => {
    for (const mode of LEVEL_MODES) {
      expect(MODE_CATALOGUE[mode].label.length).toBeGreaterThan(0);
      expect(MODE_CATALOGUE[mode].objective.length).toBeGreaterThan(0);
      expect(isLevelMode(mode)).toBe(true);
    }
    expect(isLevelMode('nope')).toBe(false);
    expect(isLevelMode('')).toBe(false);
  });
});
