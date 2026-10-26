import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  BOT_ROSTER,
  createBotProfiles,
} from '../game/match/Contestant';
import {
  coursePace,
  hasGroundAt,
  landingCenterX,
  selectCourseWaypoint,
  selectHexTarget,
} from '../game/bots/BotBrain';
import type { LevelTile, Waypoint } from '../game/levels/Level';
import { createLevel } from '../game/levels/factory';

describe('Contestant roster', () => {
  it('builds 15 unique, deterministic bot personalities from the show seed', () => {
    const first = createBotProfiles(123456);
    const second = createBotProfiles(123456);
    expect(first).toHaveLength(15);
    expect(new Set(first.map((profile) => profile.name)).size).toBe(15);
    expect(
      new Set(first.map((profile) => `${profile.look.colorId}|${profile.look.patternId}|${profile.look.hatId}`))
        .size,
    ).toBe(15);
    expect(first.map((profile) => profile.name)).toEqual(second.map((profile) => profile.name));
    for (const profile of first) {
      expect(profile.baseSkill).toBeGreaterThanOrEqual(0.45);
      expect(profile.baseSkill).toBeLessThanOrEqual(0.95);
      expect(profile.baseReaction).toBeGreaterThanOrEqual(0.12);
      expect(profile.baseReaction).toBeLessThanOrEqual(0.38);
      expect(profile.baseAggression).toBeGreaterThanOrEqual(0);
      expect(profile.baseAggression).toBeLessThanOrEqual(1);
      expect(profile.baseMistakeChance).toBeGreaterThanOrEqual(0.02);
      expect(profile.baseMistakeChance).toBeLessThanOrEqual(0.12);
    }
  });

  it('uses original pun names, not trademarked character names', () => {
    for (const entry of BOT_ROSTER) {
      expect(entry.name.length).toBeGreaterThan(3);
      expect(entry.name).not.toMatch(/mario|sonic|pokemon|bean'?s/i);
    }
  });
});

describe('bot navigation logic', () => {
  it('paces within ±8% and never above the player cap', () => {
    expect(coursePace(0, 1)).toBeCloseTo(1.08, 5);
    expect(coursePace(1, 0)).toBeCloseTo(0.92, 5);
    expect(coursePace(0.5, 0.5)).toBeCloseTo(1, 5);
  });

  it('advances Course waypoints when reached or passed', () => {
    const waypoints: Waypoint[] = [10, 4, -3].map((z, index) => ({
      position: new Vector3(0, 0, z),
      action: index === 1 ? 'jump' : 'run',
      radius: 1.1,
    }));
    expect(selectCourseWaypoint(waypoints, new Vector3(0, 0, 9.5), 0)).toBe(1);
    expect(selectCourseWaypoint(waypoints, new Vector3(0, 0, 1.5), 1)).toBe(2);
    expect(selectCourseWaypoint(waypoints, new Vector3(0, 0, -2), 0)).toBe(3);
  });

  it('chooses a stable adjacent tile and ignores warned / falling tiles', () => {
    const tiles: LevelTile[] = [
      { x: 0, y: 0, z: 0, tier: 0, ring: 0, state: 'warning', warning: 2, safe: false },
      { x: 2, y: 0, z: 0, tier: 0, ring: 1, state: 'idle', warning: 0, safe: false },
      { x: -2, y: 0, z: 0, tier: 0, ring: 1, state: 'falling', warning: 0, safe: false },
      { x: 0, y: 0, z: 2, tier: 0, ring: 1, state: 'idle', warning: 0, safe: false },
    ];
    const chosen = selectHexTarget(tiles, 0, 0, 0, 0);
    expect(chosen?.x).toBe(2);
    expect(chosen?.state).toBe('idle');
  });

  it('detects the Course floor and the first gap without mutating it', () => {
    const level = createLevel('course', 20260418);
    expect(hasGroundAt(level, 0, -0.06, 15)).toBe(true);
    expect(hasGroundAt(level, 0, -0.06, -3.7)).toBe(false);
    const moving = landingCenterX(level, new Vector3(0, 0.02, -65), 0);
    expect(moving).not.toBeNull();
    level.dispose();
  });
});
