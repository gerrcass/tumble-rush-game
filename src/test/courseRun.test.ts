import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createLevel } from '../game/levels/factory';
import { FIXED_STEP, PhysicsWorld } from '../game/physics/PhysicsWorld';
import { BeanBody } from '../game/physics/BeanBody';
import { BeanController } from '../game/player/BeanController';
import { createBotBrain, type BotBrain } from '../game/bots/BotBrain';
import { createBotProfiles, type Contestant } from '../game/match/Contestant';
import { Match } from '../game/match/Match';
import type { Level } from '../game/levels/Level';
import type { BeanLook } from '../game/cosmetics';

interface Bot {
  contestant: Contestant;
  body: BeanBody;
  controller: BeanController;
  brain: BotBrain;
  finishTime: number | null;
}

function fakeContestant(id: number, body: BeanBody, look: BeanLook): Contestant {
  const contestant = {
    id,
    name: id === 0 ? 'YOU' : `Bot ${id}`,
    look,
    isPlayer: id === 0,
    body,
    bean: {
      setVisible: () => undefined,
      setCelebrating: () => undefined,
    },
    controller: {},
    brain: null,
    status: 'racing',
    placement: null,
    finishTime: null,
    eliminatedAt: null,
    progress: 0,
    height: 0,
    distanceToCrown: 0,
    lane: id % 3,
    skill: 0.7,
    reaction: 0.2,
    aggression: 0.3,
    mistakeChance: 0.05,
    targetLabel: '',
    updateProgress: (value: number) => {
      contestant.progress = value;
    },
    applyDifficulty: () => undefined,
    hide: () => undefined,
  };
  return contestant as unknown as Contestant;
}

/** Run the authored Course with 15 bots and a stationary human, no input. */
function runNoInputRace(seed: number): {
  finishers: number;
  eighthFinish: number;
  deaths: number;
} {
  const level = createLevel('course', seed);
  const world = new PhysicsWorld();
  world.killY = level.killY;
  for (const collider of level.colliders) world.addCollider(collider);

  const profiles = createBotProfiles(seed);
  const playerBody = new BeanBody({ position: level.startPosition.clone().setZ(17.8) });
  world.addBody(playerBody);
  const bots: Bot[] = [];
  for (let i = 0; i < 15; i += 1) {
    const body = new BeanBody();
    const row = Math.floor(i / 5);
    const col = i % 5;
    body.reset((col - 2) * 1.65, 0.04, 15.65 - row * 1.65);
    world.addBody(body);
    const contestant = fakeContestant(i + 1, body, profiles[i]!.look);
    contestant.skill = profiles[i]!.baseSkill;
    contestant.reaction = profiles[i]!.baseReaction;
    contestant.aggression = profiles[i]!.baseAggression;
    contestant.mistakeChance = profiles[i]!.baseMistakeChance;
    bots.push({
      contestant,
      body,
      controller: new BeanController(body, world),
      brain: createBotBrain('course', contestant, seed)!,
      finishTime: null,
    });
  }

  let elapsed = 0;
  while (elapsed < 120) {
    level.step(FIXED_STEP, world.bodies);
    const leaderProgress = Math.max(
      ...bots.filter((bot) => !bot.body.eliminated).map((bot) => level.progress(bot.body.position)),
    );
    for (const bot of bots) {
      if (bot.body.eliminated) continue;
      bot.contestant.progress = level.progress(bot.body.position);
      const frame = bot.brain.think({
        level,
        body: bot.body,
        contestants: [bot.contestant],
        leaderProgress,
        dt: FIXED_STEP,
      });
      bot.controller.update(FIXED_STEP, frame);
    }
    world.step(FIXED_STEP);
    elapsed += FIXED_STEP;
    for (const bot of bots) {
      if (!bot.body.eliminated && bot.finishTime === null && level.isAtFinish(bot.body.position)) {
        bot.finishTime = elapsed;
      }
    }
  }

  const times = bots
    .map((bot) => bot.finishTime)
    .filter((time): time is number => time !== null)
    .sort((a, b) => a - b);
  level.dispose();
  return {
    finishers: times.length,
    eighthFinish: times[7] ?? Infinity,
    deaths: bots.filter((bot) => bot.body.eliminated).length,
  };
}

describe('Sunrise Scramble no-input race', () => {
  it('gets at least eight bots through the gate before the timer', () => {
    const result = runNoInputRace(20260418);
    expect(result.finishers).toBeGreaterThanOrEqual(8);
    expect(result.eighthFinish).toBeLessThan(120);
    // The stationary human never advances on the bots' finish times.
    expect(result.deaths + result.finishers).toBeLessThanOrEqual(15);
  }, 60_000);
});

describe('Course finish gate authority', () => {
  it('is purely spatial and Course.step never awards a finish', () => {
    const course = createLevel('course', 9);
    const body = new BeanBody({ position: course.finishPosition.clone() });
    course.step(FIXED_STEP, [body]);
    expect(course.status().result).toBeNull();
    expect(course.isAtFinish(course.finishPosition)).toBe(true);
    expect(course.isAtFinish(course.startPosition)).toBe(false);
    // Even after the Practice/debug finish path sets a result, only the gate
    // point is a finish; the flag cannot leak to every other entrant.
    course.finishNow();
    expect(course.isAtFinish(course.startPosition)).toBe(false);
    course.dispose();
  });

  it('credits exactly one teleported finisher through the Match', () => {
    const course = createLevel('course', 11);
    const contestants = Array.from({ length: 16 }, (_, index) => {
      const body = new BeanBody({ position: course.startPosition.clone() });
      return fakeContestant(index, body, { colorId: 'coral', patternId: 'stripes', hatId: 'none', emoteId: 'wave' });
    });
    const match = new Match({
      seed: 11,
      seedLabel: '#0000000B',
      difficulty: 'show',
      contestants,
      player: contestants[0]!,
      callbacks: {
        prepareRound: () => undefined,
        onStamp: () => undefined,
        onPhase: () => undefined,
        onSpectate: () => undefined,
        onShowEnd: () => undefined,
      },
    });
    match.startShow();
    match.beginRound();

    // Teleport one bot onto the gate; leave everybody else at the start.
    contestants[7]!.body.position.copy(course.finishPosition);
    match.afterPhysics(course as Level);

    const completed = contestants.filter((contestant) => contestant.finishTime !== null);
    expect(completed).toHaveLength(1);
    expect(completed[0]?.id).toBe(7);
    expect(completed[0]?.status).toBe('qualified');
    expect(match.phase).toBe('playing');
    course.dispose();
  });
});

describe('Hexapop start perch', () => {
  it('drops a stationary centre player before the timer', () => {
    const level = createLevel('hexapop', 20260418);
    const world = new PhysicsWorld();
    world.killY = level.killY;
    for (const collider of level.colliders) world.addCollider(collider);
    const body = new BeanBody({ position: new Vector3(0, 0.43, 0) });
    world.addBody(body);

    let elapsed = 0;
    while (elapsed < 20 && !body.eliminated) {
      level.step(FIXED_STEP, world.bodies);
      world.step(FIXED_STEP);
      elapsed += FIXED_STEP;
    }
    expect(body.eliminated).toBe(true);
    expect(elapsed).toBeLessThan(20);
    // The centre hex is no longer permanently safe.
    const centre = level
      .queryTiles?.()
      .find((tile) => Math.abs(tile.x) < 0.01 && Math.abs(tile.z) < 0.01 && tile.tier === 0);
    expect(centre?.safe).toBe(false);
    level.dispose();
  });
});
