import { describe, expect, it } from 'vitest';
import { Scene, Vector3 } from 'three';
import { createLevel } from '../game/levels/factory';
import { FIXED_STEP, PhysicsWorld } from '../game/physics/PhysicsWorld';
import { BeanBody } from '../game/physics/BeanBody';
import { createBotBrain, createCasualPilot } from '../game/bots/BotBrain';
import {
  Contestant,
  createBotProfiles,
  playerLook,
} from '../game/match/Contestant';
import { Match } from '../game/match/Match';
import type { Level } from '../game/levels/Level';
import type { ControllerFrame } from '../game/player/BeanController';
import { startPositionsFor } from '../game/levels/startPositions';

const IDLE_FRAME: ControllerFrame = {
  moveX: 0,
  moveZ: 0,
  cameraYaw: 0,
  jumpPressed: false,
  jumpHeld: false,
  divePressed: false,
  grabPressed: false,
  grabHeld: false,
  emotePressed: false,
};

interface ShowField {
  world: PhysicsWorld;
  contestants: Contestant[];
  player: Contestant;
}

/** Real Contestants (body, controller, presentation) sharing one physics world. */
function buildShowField(seed: number): ShowField {
  const world = new PhysicsWorld();
  const scene = new Scene();
  const profiles = createBotProfiles(seed);
  const player = new Contestant({
    id: 0,
    name: 'YOU',
    look: playerLook(),
    isPlayer: true,
    world,
    scene,
    outline: false,
    phase: 0,
  });
  const bots = profiles.map(
    (profile, index) =>
      new Contestant({
        id: index + 1,
        name: profile.name,
        look: profile.look,
        isPlayer: false,
        world,
        scene,
        outline: false,
        phase: (index + 1) % 3,
        skill: profile.baseSkill,
        reaction: profile.baseReaction,
        aggression: profile.baseAggression,
        mistakeChance: profile.baseMistakeChance,
      }),
  );
  return { world, contestants: [player, ...bots], player };
}

/**
 * Walk the exact Game step order (level.step → brains/controllers → world.step
 * → Match.afterPhysics) with the production spawn placement. This is a Match,
 * not a hand-built race: every entrant is in every brain's context.
 */
function runShow(
  seed: number,
  mode: 'course' | 'hexapop',
  seconds: number,
  casual = false,
): {
  match: Match;
  level: Level;
  field: ShowField;
  elapsed: number;
} {
  const field = buildShowField(seed);
  const { world, contestants, player } = field;
  let level: Level = createLevel(mode, seed);
  const match = new Match({
    seed,
    seedLabel: '#test',
    difficulty: 'show',
    contestants,
    player,
    callbacks: {
      prepareRound: (index, entrants) => {
        const roundMode = index === 0 ? 'course' : index === 1 ? 'hexapop' : 'crown-climb';
        level = createLevel(roundMode, seed);
        world.clearColliders();
        for (const collider of level.colliders) world.addCollider(collider);
        world.bodies.length = 0;
        const ordered = [...entrants].sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer));
        for (const contestant of ordered) {
          contestant.body.eliminated = false;
          world.addBody(contestant.body);
        }
        const positions = startPositionsFor(level, roundMode, entrants, seed);
        for (let i = 0; i < entrants.length; i += 1) {
          const contestant = entrants[i]!;
          contestant.resetForRound(positions[i]!, i % 3, 'racing');
          if (!contestant.isPlayer) {
            contestant.brain = createBotBrain(roundMode, contestant, seed);
          }
        }
      },
      onStamp: () => undefined,
      onPhase: () => undefined,
      onSpectate: () => undefined,
      onShowEnd: () => undefined,
    },
  });

  const casualPilot = casual ? createCasualPilot(player, seed) : null;
  match.startShow();
  if (mode === 'hexapop') match.jumpToRound(1);
  match.beginRound();
  let elapsed = 0;
  while (match.phase === 'playing' && elapsed < seconds) {
    match.tick(FIXED_STEP);
    if (match.phase !== 'playing') break;
    level.step(FIXED_STEP, world.bodies);
    const active = match.entrantsList;
    const leaderProgress = active.reduce(
      (max, contestant) => (contestant.body.eliminated ? max : Math.max(max, contestant.progress)),
      0,
    );
    // Match the real Game step: bots receive the human's progress so the
    // bounded human-pace anchor is part of the measured casual run.
    const humanProgress = active.includes(player)
      ? player.body.eliminated
        ? null
        : player.progress
      : null;
    for (const contestant of active) {
      if (contestant.body.eliminated || contestant.finishTime !== null) continue;
      if (contestant.isPlayer) {
        contestant.controller.update(
          FIXED_STEP,
          casualPilot
            ? casualPilot.think({
                level,
                body: contestant.body,
                contestants: active,
                leaderProgress,
                humanProgress: contestant.body.eliminated ? null : contestant.progress,
                dt: FIXED_STEP,
              })
            : IDLE_FRAME,
        );
      } else {
        const brain =
          contestant.brain ?? createBotBrain(level.mode, contestant, seed);
        if (!brain) continue;
        contestant.brain = brain;
        const frame = brain.think({
          level,
          body: contestant.body,
          contestants: active,
          leaderProgress,
          humanProgress,
          dt: FIXED_STEP,
        });
        contestant.controller.update(FIXED_STEP, frame);
      }
    }
    world.step(FIXED_STEP);
    if (!player.body.eliminated) {
      if (player.body.landedThisStep) {
        player.controller.notifyLand(player.body.lastImpactSpeed);
        player.body.landedThisStep = false;
      } else if (player.body.lastImpactSpeed > 12) {
        player.controller.notifyImpact(player.body.lastImpactSpeed);
      }
    }
    match.afterPhysics(level);
    elapsed += FIXED_STEP;
  }
  return { match, level, field, elapsed };
}

describe('Sunrise Scramble real-pack no-input race', () => {
  it.each([20260418, 7, 123456, 3])(
    'seed %i gets at least eight real finishers and never qualifies the idle human',
    (seed) => {
      const { match, level, field, elapsed } = runShow(seed, 'course', 125);
      const finishers = field.contestants.filter(
        (contestant) => contestant.finishTime !== null,
      );
      const placements = match.finalPlacements;
      const playerEntry = placements.find((entry) => entry.isPlayer);
      console.log(
        `REAL_PACK seed=${seed} finishers=${finishers.length} qualifiers=${placements.filter((entry) => entry.qualified).length} elapsed=${elapsed.toFixed(1)}`,
      );
      expect(finishers.length).toBeGreaterThanOrEqual(8);
      expect(finishers[7]?.finishTime ?? Infinity).toBeLessThan(120);
      expect(match.phase).toBe('results');
      expect(placements.filter((entry) => entry.qualified)).toHaveLength(8);
      // M2 Course band: the second lap and humanized pack must not collapse
      // back into the 26 s metronome or drag past the 90 s ceiling.
      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThanOrEqual(90);
      // The human did not move: a timeout must not hand them a qualifier slot.
      expect(playerEntry?.qualified).toBe(false);
      expect(playerEntry?.status).toBe('ELIMINATED');
      level.dispose();
    },
    30_000,
  );
});

describe('Course scripted casual qualification (M2)', () => {
  it('qualifies at least 7/10 while the idle human never qualifies', () => {
    const seeds = [20260418, 20365147, 20469876, 20574605, 20679334, 20784063, 20888792, 20993521, 21098250, 21202979];
    let qualified = 0;
    for (const seed of seeds) {
      const { match, level, elapsed } = runShow(seed, 'course', 125, true);
      const placements = match.finalPlacements;
      const playerEntry = placements.find((entry) => entry.isPlayer);
      if (playerEntry?.qualified) qualified += 1;
      const idle = runShow(seed, 'course', 125, false);
      const idlePlayer = idle.match.finalPlacements.find((entry) => entry.isPlayer);
      console.log(
        `CASUAL seed=${seed} ${playerEntry?.qualified ? 'Q' : 'OUT'} finish=${playerEntry?.finishTime?.toFixed(1) ?? '—'} clock=${elapsed.toFixed(1)} finishers=${placements.filter((entry) => entry.finishTime !== null).length}`,
      );
      expect(placements.filter((entry) => entry.finishTime !== null).length).toBeGreaterThanOrEqual(8);
      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThanOrEqual(90);
      expect(idlePlayer?.qualified).toBe(false);
      expect(idlePlayer?.status).toBe('ELIMINATED');
      level.dispose();
      idle.level.dispose();
    }
    expect(qualified).toBeGreaterThanOrEqual(7);
  }, 120_000);
});

describe('Course connector and final checkpoint (M2)', () => {
  it('labels the lap-2 connector instead of a stale section E', () => {
    const level = createLevel('course', 20260418);
    const body = new BeanBody();
    body.position.set(0, 4.6, -162);
    level.step(FIXED_STEP, [body]);
    expect(level.status().phase).toBe('LAP 2 · CONNECTOR');
    level.dispose();
  });

  it('places the final checkpoint on lap 2\'s raised finish deck', () => {
    const level = createLevel('course', 20260418);
    const final = level.checkpoints[level.checkpoints.length - 1]!;
    expect(final.position.y).toBe(9);
    expect(final.maxY).toBe(11);
    expect(final.position.z).toBe(-340);
    level.dispose();
  });
});

describe('Course two-lap grammar (M2)', () => {
  it('reuses the five sections twice and only finishes at the final gate', () => {
    const course = createLevel('course', 20260418);
    const lapTwoFinish = new Vector3(0, 4.6, -156);
    expect(course.waypoints).toHaveLength(55);
    expect(course.finishPosition.z).toBeCloseTo(-340, 5);
    expect(course.finishPosition.y).toBeCloseTo(9.1, 5);
    // Lap 1's gate is a lap gate, not the finish.
    expect(course.isAtFinish(lapTwoFinish)).toBe(false);
    expect(course.isAtFinish(course.finishPosition)).toBe(true);
    // The start deck sits just inside the authored 18 u start line.
    expect(course.progress(new Vector3(0, 0, 16))).toBeGreaterThan(0);
    expect(course.progress(new Vector3(0, 0, 16))).toBeLessThan(0.01);
    expect(course.progress(course.finishPosition)).toBeCloseTo(1, 5);
    // The same five section names are authored on both laps.
    const status = course.status();
    expect(status.phase).toBe('SHOWTIME');
    expect(course.title).toBe('SUNRISE SCRAMBLE');
    course.dispose();
  });
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
      const contestant = {
        id: index,
        name: index === 0 ? 'YOU' : `Bot ${index}`,
        isPlayer: index === 0,
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
        lane: index % 3,
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

describe('Hexapop real spawn', () => {
  it('gives the human the centre perch and only drops them after the grace', () => {
    const { match, level, field } = runShow(20260418, 'hexapop', 2.6);
    const player = field.player;
    expect(player.body.position.x).toBeCloseTo(0, 2);
    expect(player.body.position.z).toBeCloseTo(0, 2);
    expect(player.body.position.y).toBeGreaterThan(0.3);
    expect(player.body.eliminated).toBe(false);
    expect(player.status).toBe('racing');
    expect(match.phase).toBe('playing');

    let elapsed = 2.6;
    const world = field.world;
    while (match.phase === 'playing' && elapsed < 8 && !player.body.eliminated) {
      match.tick(FIXED_STEP);
      if (match.phase !== 'playing') break;
      level.step(FIXED_STEP, world.bodies);
      const active = match.entrantsList;
      const leaderProgress = active.reduce(
        (max, contestant) => (contestant.body.eliminated ? max : Math.max(max, contestant.progress)),
        0,
      );
      for (const contestant of active) {
        if (contestant.body.eliminated || contestant.finishTime !== null) continue;
        if (contestant.isPlayer) {
          contestant.controller.update(FIXED_STEP, IDLE_FRAME);
        } else {
          const brain = contestant.brain ?? createBotBrain('hexapop', contestant, 20260418);
          if (!brain) continue;
          contestant.brain = brain;
          contestant.controller.update(
            FIXED_STEP,
            brain.think({
              level,
              body: contestant.body,
              contestants: active,
              leaderProgress,
              dt: FIXED_STEP,
            }),
          );
        }
      }
      world.step(FIXED_STEP);
      match.afterPhysics(level);
      elapsed += FIXED_STEP;
    }
    expect(elapsed).toBeGreaterThan(4);
    expect(player.body.eliminated).toBe(true);
    level.dispose();
  }, 30_000);
});
