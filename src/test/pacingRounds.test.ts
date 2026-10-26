import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { createLevel } from '../game/levels/factory';
import { FIXED_STEP, PhysicsWorld } from '../game/physics/PhysicsWorld';
import { createBotBrain } from '../game/bots/BotBrain';
import { Contestant, createBotProfiles, playerLook } from '../game/match/Contestant';
import { Match } from '../game/match/Match';
import type { Level } from '../game/levels/Level';
import type { ControllerFrame } from '../game/player/BeanController';
import { startPositionsFor } from '../game/levels/startPositions';
import { CROWN_PHYSICAL, sweepSeeds, touchesCrown } from '../../scripts/lib/pacing.mjs';

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

interface RoundReport {
  mode: string;
  seconds: number;
  finishers: number;
  qualified: number;
  livingWinner: boolean;
  winnerTouchedCrown: boolean;
  winnerHeight: number | null;
  winnerDistanceToCrown: number | null;
  winnerFinishTime: number | null;
  winnerEliminated: boolean | null;
  /** Outermost-ring tiles still present when the 45 s Sugar Rush wave starts. */
  rushRingWarnings: number;
  rushRingAfter: number;
}

interface ShowReport {
  seed: number;
  totalSeconds: number;
  roundSeconds: number;
  rounds: RoundReport[];
}

/**
 * Drive the real Match/Game step order through a complete observed show:
 * 16 entrants, idle human, advancing bots. This is the same seam the pacing
 * harness uses, with real bodies, levels, brains, controllers and physics.
 */
function runObservedShow(seed: number): ShowReport {
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
  const contestants = [player, ...bots];
  let level: Level = createLevel('course', seed);
  const rounds: RoundReport[] = [];
  let rushRingWarnings = 0;
  let rushRingAfter = 0;
  let rushRing = -1;
  let rushSampleTaken = false;
  let afterSampleTaken = false;

  const match = new Match({
    seed,
    seedLabel: '#test',
    difficulty: 'show',
    contestants,
    player,
    continueWhenPlayerOut: true,
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
        rushRingWarnings = 0;
        rushRingAfter = 0;
        rushRing = -1;
        rushSampleTaken = false;
        afterSampleTaken = false;
      },
      onStamp: () => undefined,
      onPhase: () => undefined,
      onSpectate: () => undefined,
      onShowEnd: () => undefined,
    },
  });

  match.startShow();
  let elapsed = 0;
  let captured = -1;
  while (match.phase !== 'victory' && match.phase !== 'defeat' && elapsed < 500) {
    match.tick(FIXED_STEP);
    if (match.phase === 'playing') {
      level.step(FIXED_STEP, world.bodies);
      const active = match.entrantsList;
      const leaderProgress = active.reduce(
        (max, contestant) =>
          contestant.body.eliminated ? max : Math.max(max, contestant.progress),
        0,
      );
      for (const contestant of active) {
        if (contestant.body.eliminated || contestant.finishTime !== null) continue;
        if (contestant.isPlayer) {
          contestant.controller.update(FIXED_STEP, IDLE_FRAME);
        } else {
          const brain = contestant.brain ?? createBotBrain(level.mode, contestant, seed);
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

      if (level.mode === 'hexapop' && level.queryTiles) {
        if (!rushSampleTaken && match.roundTime >= 45.05) {
          rushSampleTaken = true;
          const tiles = level.queryTiles();
          for (const tile of tiles) {
            if (tile.state !== 'gone') rushRing = Math.max(rushRing, tile.ring);
          }
          rushRingWarnings = tiles.filter(
            (tile) => tile.ring === rushRing && tile.state === 'warning',
          ).length;
        }
        if (!afterSampleTaken && match.roundTime >= 46.4) {
          afterSampleTaken = true;
          rushRingAfter = level
            .queryTiles()
            .filter(
              (tile) =>
                tile.ring === rushRing && (tile.state === 'idle' || tile.state === 'warning'),
            ).length;
        }
      }
    }
    if (match.phase === 'results' && captured !== match.roundIndex) {
      captured = match.roundIndex;
      const placements = match.finalPlacements;
      const winner = placements.find((entry) => entry.won) ?? null;
      rounds.push({
        mode: level.mode,
        seconds: Number(match.roundTime.toFixed(2)),
        finishers: placements.filter((entry) => entry.finishTime !== null).length,
        qualified: placements.filter((entry) => entry.qualified).length,
        // Physical fields first; the flags are derived from them, never from
        // the code's own living/finish bookkeeping alone.
        livingWinner: Boolean(winner && winner.finishTime !== null && !winner.eliminated),
        winnerTouchedCrown: winner ? touchesCrown(winner) : false,
        winnerHeight: winner?.height ?? null,
        winnerDistanceToCrown: winner?.distanceToCrown ?? null,
        winnerFinishTime: winner?.finishTime ?? null,
        winnerEliminated: winner?.eliminated ?? null,
        rushRingWarnings,
        rushRingAfter,
      });
    }
    elapsed += FIXED_STEP;
  }

  return {
    seed,
    totalSeconds: Number(elapsed.toFixed(2)),
    roundSeconds: Number(rounds.reduce((sum, round) => sum + round.seconds, 0).toFixed(2)),
    rounds,
  };
}

describe('M2 Phase B real-Match pacing', () => {
  it('runs the 10-seed show: Hexapop tension, Crown living winner, 3–5 min total', () => {
    const seeds = sweepSeeds(20260418, 10) as number[];
    const shows = seeds.map((seed) => runObservedShow(seed));
    const hexes = shows.map((show) => show.rounds.find((round) => round.mode === 'hexapop')!);
    const crowns = shows.map((show) => show.rounds.find((round) => round.mode === 'crown-climb')!);
    const totals = shows.map((show) => show.totalSeconds).sort((a, b) => a - b);

    for (const show of shows) {
      const hex = show.rounds.find((round) => round.mode === 'hexapop')!;
      const crown = show.rounds.find((round) => round.mode === 'crown-climb')!;
      console.log(
        `M2_PHASE_B seed=${show.seed} total=${show.totalSeconds} ` +
          `hex=${hex.seconds}s q=${hex.qualified} rushWarn=${hex.rushRingWarnings} after=${hex.rushRingAfter} ` +
          `crown=${crown.seconds}s living=${crown.livingWinner} touch=${crown.winnerTouchedCrown}`,
      );
    }

    // Every Round clock sits in its authored band. Hexapop's hard cap is 49.9 s
    // so the Sugar Rush is always part of the Round rather than an unused knob.
    for (const hex of hexes) {
      expect(hex.seconds).toBeGreaterThanOrEqual(30);
      expect(hex.seconds).toBeLessThanOrEqual(50);
      expect(hex.qualified).toBeGreaterThanOrEqual(3);
    }
    for (const crown of crowns) {
      expect(crown.seconds).toBeGreaterThanOrEqual(45);
      expect(crown.seconds).toBeLessThanOrEqual(80);
      expect(crown.livingWinner).toBe(true);
      expect(crown.winnerTouchedCrown).toBe(true);
      expect(crown.winnerFinishTime).not.toBeNull();
      expect(crown.winnerEliminated).toBe(false);
      expect(crown.winnerHeight).not.toBeNull();
      expect(crown.winnerDistanceToCrown).not.toBeNull();
      // A real crown touch: the head reaches the band and the body is inside
      // the band radius. This fails for dais proximity under a floating crown.
      expect(crown.winnerHeight! + CROWN_PHYSICAL.beanHeight).toBeGreaterThanOrEqual(
        CROWN_PHYSICAL.centerY,
      );
      expect(crown.winnerDistanceToCrown!).toBeLessThanOrEqual(
        CROWN_PHYSICAL.bandRadius + CROWN_PHYSICAL.beanRadius,
      );
    }

    // Most of the sweep plays through the 45 s Sugar Rush beat. Two seeds can
    // resolve a moment before it when a qualifier falls on the last step; the
    // deterministic ring-drop test lives in hexapop.test.ts.
    expect(hexes.filter((hex) => hex.seconds >= 45).length).toBeGreaterThanOrEqual(8);
    // M-3: every real four-survivor Round that reaches the Sugar Rush must
    // warn the outer ring and then remove it. The old `living > 4` guard made
    // this a no-op at exactly four survivors.
    const rushRounds = hexes.filter((hex) => hex.seconds >= 45.05);
    for (const hex of rushRounds) {
      expect(hex.rushRingWarnings).toBeGreaterThan(0);
      expect(hex.rushRingAfter).toBe(0);
    }

    // At least four Tumblers reach Hexapop's qualifying row on the baseline
    // seed and most of the sweep; a smaller living field still advances.
    expect(hexes[0]!.qualified).toBe(4);
    expect(hexes.filter((hex) => hex.qualified >= 4).length).toBeGreaterThanOrEqual(8);
    expect(crowns.filter((crown) => crown.livingWinner).length).toBe(10);

    const median = (totals[4]! + totals[5]!) / 2;
    expect(median).toBeGreaterThanOrEqual(180);
    expect(median).toBeLessThanOrEqual(300);
    expect(totals[0]!).toBeGreaterThanOrEqual(150);
    expect(totals[totals.length - 1]!).toBeLessThanOrEqual(360);
  }, 300_000);
});
