import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createLevel } from '../game/levels/factory';
import type { Course } from '../game/levels/Course';
import type { Hexapop } from '../game/levels/Hexapop';
import type { Level } from '../game/levels/Level';
import { FIXED_STEP } from '../game/physics/PhysicsWorld';
import { planShow } from '../game/levels/coursePlan';
import { Match } from '../game/match/Match';
import type { Contestant } from '../game/match/Contestant';

const RUSH_SEED = 20888792;
const MOON_SEED = 20469876;
const SLIPPERY_SEED = 20260418;

function simulate(level: Level, seconds: number, bodies: Parameters<Level['step']>[1] = []): void {
  const steps = Math.round(seconds / FIXED_STEP);
  for (let i = 0; i < steps; i += 1) level.step(FIXED_STEP, bodies);
}

function fakeContestant(id: number, isPlayer = false): Contestant {
  const body = {
    position: new Vector3(0, 0, 0),
    velocity: new Vector3(),
    eliminated: false,
  };
  const contestant = {
    id,
    name: isPlayer ? 'YOU' : `Bot ${id}`,
    isPlayer,
    body,
    bean: { setVisible: () => undefined, setCelebrating: () => undefined },
    controller: {},
    brain: null,
    status: 'waiting',
    placement: null,
    finishTime: null,
    eliminatedAt: null,
    progress: 0,
    height: 0,
    distanceToCrown: 0,
    lane: 0,
    targetLabel: '',
    skill: 0.7,
    reaction: 0.2,
    aggression: 0.3,
    mistakeChance: 0.05,
    updateProgress: (value: number) => {
      (contestant as unknown as { progress: number }).progress = value;
    },
    applyDifficulty: () => undefined,
    hide: () => undefined,
  };
  return contestant as unknown as Contestant;
}

function makeMatch(seed: number, stamps: string[] = []): Match {
  const contestants = Array.from({ length: 16 }, (_, index) => fakeContestant(index, index === 0));
  return new Match({
    seed,
    seedLabel: '#0000000B',
    difficulty: 'show',
    contestants,
    player: contestants[0]!,
    callbacks: {
      prepareRound: () => undefined,
      onStamp: (stamp) => stamps.push(stamp.text),
      onPhase: () => undefined,
      onSpectate: () => undefined,
      onShowEnd: () => undefined,
    },
  });
}

describe('M4 Course twist integration', () => {
  it('sets the Course clock from the plan twist and multiplies hazard speeds', () => {
    const rush = createLevel('course', RUSH_SEED) as Course;
    const moon = createLevel('course', MOON_SEED) as Course;
    const slippery = createLevel('course', SLIPPERY_SEED) as Course;
    expect(rush.twist.id).toBe('rush');
    expect(rush.status().timeLimit).toBe(105);
    expect(rush.hazardSpeedScale).toBeCloseTo(1.1, 8);
    expect(moon.twist.id).toBe('moon');
    expect(moon.status().timeLimit).toBe(120);
    expect(moon.hazardSpeedScale).toBe(1);
    expect(slippery.twist.id).toBe('slippery');
    expect(slippery.status().timeLimit).toBe(120);
    expect(slippery.hazardSpeedScale).toBe(1);
    rush.dispose();
    moon.dispose();
    slippery.dispose();
  });

  it('keeps Course geometry, waypoints, checkpoints and qualification unchanged', () => {
    for (const seed of [RUSH_SEED, MOON_SEED, SLIPPERY_SEED]) {
      const show = planShow(seed);
      const a = createLevel('course', seed) as Course;
      const b = createLevel('course', seed) as Course;
      expect(a.plan).toEqual(show.course);
      expect(a.waypoints.map((point) => point.position.toArray())).toEqual(
        b.waypoints.map((point) => point.position.toArray()),
      );
      expect(a.checkpoints).toEqual(b.checkpoints);
      expect(a.colliders.length).toBe(b.colliders.length);
      expect(a.plan.laps.map((lap) => lap.route)).toEqual(show.course.laps.map((lap) => lap.route));
      a.dispose();
      b.dispose();
    }
  });
});

describe('M4 Hexapop twist integration', () => {
  it('starts RUSH HOUR Sugar Rush at 38 s and caps the Round at 42.9 s', () => {
    const rush = createLevel('hexapop', RUSH_SEED) as Hexapop;
    expect(rush.twist.id).toBe('rush');
    expect(rush.sugarRushSeconds).toBe(38);
    expect(rush.status().timeLimit).toBe(42.9);
    simulate(rush, 37.8);
    expect(rush.sugarRushReached).toBe(false);
    expect(rush.status().phase).not.toBe('SUGAR RUSH');
    simulate(rush, 0.3);
    expect(rush.sugarRushReached).toBe(true);
    expect(rush.status().phase).toBe('SUGAR RUSH');
    expect(rush.queryTiles().some((tile) => tile.state === 'warning')).toBe(true);
    rush.dispose();
  });

  it('leaves MOON and SLIPPERY on the classic 45 s Sugar Rush and 49.9 s cap', () => {
    for (const seed of [MOON_SEED, SLIPPERY_SEED]) {
      const level = createLevel('hexapop', seed) as Hexapop;
      expect(level.sugarRushSeconds).toBe(45);
      expect(level.status().timeLimit).toBe(49.9);
      simulate(level, 44.8);
      expect(level.sugarRushReached).toBe(false);
      simulate(level, 0.3);
      expect(level.sugarRushReached).toBe(true);
      level.dispose();
    }
  });

  it('keeps the readable 3.3 s pre-rush warning', () => {
    const level = createLevel('hexapop', SLIPPERY_SEED) as Hexapop;
    const tile = level
      .queryTiles()
      .find((entry) => entry.tier === 0 && entry.ring === 1 && entry.state === 'idle');
    expect(tile).toBeDefined();
    const body = {
      position: new Vector3(tile!.x, tile!.y, tile!.z),
      eliminated: false,
    } as Parameters<Level['step']>[1][number];
    level.step(FIXED_STEP, [body]);
    const warned = level.queryTiles().find(
      (entry) => Math.abs(entry.x - tile!.x) < 1e-6 && Math.abs(entry.z - tile!.z) < 1e-6,
    );
    expect(warned?.state).toBe('warning');
    expect(warned!.warning).toBeGreaterThan(3.27);
    expect(warned!.warning).toBeLessThanOrEqual(3.3);
    level.dispose();
  });
});

describe('M4 Match and HUD twist integration', () => {
  it('uses the qualifier clocks and exposes the twist, then reports CLASSIC on the Crown', () => {
    const match = makeMatch(RUSH_SEED);
    const course = createLevel('course', RUSH_SEED);
    match.startShow();
    match.jumpToRound(0);
    const courseHud = match.hud(course);
    expect(courseHud.timeLimit).toBe(105);
    expect(courseHud.twistLabel).toBe('RUSH HOUR');
    expect(courseHud.twistShort).toBe('RUSH');
    expect(courseHud.twistClassic).toBe(false);
    const hex = createLevel('hexapop', RUSH_SEED);
    match.jumpToRound(1);
    const hexHud = match.hud(hex);
    expect(hexHud.timeLimit).toBe(42.9);
    expect(hexHud.twistShort).toBe('RUSH');
    const crown = createLevel('crown-climb', RUSH_SEED);
    match.jumpToRound(2);
    const crownHud = match.hud(crown);
    expect(crownHud.timeLimit).toBe(120);
    expect(crownHud.twistClassic).toBe(true);
    expect(crownHud.twistLabel).toBe('CLASSIC');
    course.dispose();
    hex.dispose();
    crown.dispose();
  });

  it('stamps SUGAR RUSH at the twist clock, not a hard-coded 45', () => {
    const stamps: string[] = [];
    const match = makeMatch(RUSH_SEED, stamps);
    match.startShow();
    match.jumpToRound(1);
    match.beginRound();
    match.tick(37.8);
    expect(stamps).not.toContain('SUGAR RUSH!');
    match.tick(0.3);
    expect(stamps).toContain('SUGAR RUSH!');
  });
});
