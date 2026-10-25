import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Contestant } from '../game/match/Contestant';
import { Match } from '../game/match/Match';
import { SHOW_ROUNDS } from '../game/match/Director';
import type { Level } from '../game/levels/Level';

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
    bean: { setVisible: () => undefined },
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


function makeMatch(contestants: Contestant[]): Match {
  return new Match({
    seed: 11,
    seedLabel: '#0000000B',
    difficulty: 'show',
    contestants,
    player: contestants.find((contestant) => contestant.isPlayer) ?? contestants[0]!,
    callbacks: {
      prepareRound: () => undefined,
      onStamp: () => undefined,
      onPhase: () => undefined,
      onSpectate: () => undefined,
      onShowEnd: () => undefined,
    },
  });
}

function fakeLevel(): Level {
  return {
    progress: () => 0,
    isAtFinish: () => false,
    crownPosition: undefined,
  } as unknown as Level;
}

describe('Match show progression', () => {
  it('runs intro → countdown → play → results through all three Rounds', () => {
    const contestants = Array.from({ length: 16 }, (_, index) => fakeContestant(index, index === 0));
    const phases: string[] = [];
    const match = new Match({
      seed: 7,
      seedLabel: '#00000007',
      difficulty: 'show',
      contestants,
      player: contestants[0]!,
      callbacks: {
        prepareRound: () => undefined,
        onStamp: () => undefined,
        onPhase: (phase) => phases.push(phase),
        onSpectate: () => undefined,
        onShowEnd: () => undefined,
      },
    });

    match.startShow();
    expect(match.phase).toBe('intro');
    expect(match.entrantsList).toHaveLength(16);
    match.tick(2.2);
    expect(match.phase).toBe('countdown');
    match.tick(3.2);
    expect(match.phase).toBe('playing');

    for (let round = 0; round < SHOW_ROUNDS.length; round += 1) {
      expect(match.definition.mode).toBe(SHOW_ROUNDS[round]!.mode);
      match.finishRound();
      expect(match.phase).toBe('results');
      expect(match.finalPlacements).toHaveLength(SHOW_ROUNDS[round]!.starters);
      expect(
        match.finalPlacements.filter((entry) => entry.qualified),
      ).toHaveLength(SHOW_ROUNDS[round]!.qualifiers);
      if (round < SHOW_ROUNDS.length - 1) {
        match.nextRound();
        expect(match.phase).toBe('intro');
        match.tick(2.2);
        match.tick(3.2);
      }
    }
    match.nextRound();
    expect(match.phase).toBe('victory');
    expect(match.showResult?.won).toBe(true);
    expect(match.showResult?.roundsQualified).toBe(3);
    expect(phases).toContain('victory');
  });

  it('ends the Show in defeat when the human misses the first qualification', () => {
    const bots = Array.from({ length: 15 }, (_, index) => fakeContestant(index));
    const player = fakeContestant(99, true);
    const contestants = [...bots, player];
    const match = new Match({
      seed: 8,
      seedLabel: '#00000008',
      difficulty: 'chill',
      contestants,
      player,
      callbacks: {
        prepareRound: () => undefined,
        onStamp: () => undefined,
        onPhase: () => undefined,
        onSpectate: () => undefined,
        onShowEnd: () => undefined,
      },
    });
    match.startShow();
    expect(match.entrantsList).toHaveLength(16);
    match.beginRound();
    // Every Tumbler is tied: the Course tie-break is id, and the player has the
    // highest id in the fake field, so they miss the top eight.
    match.finishRound();
    const playerEntry = match.finalPlacements.find((entry) => entry.isPlayer);
    expect(playerEntry?.qualified).toBe(false);
    match.nextRound();
    expect(match.phase).toBe('defeat');
    expect(match.showResult?.playerPlacement).toBeGreaterThan(8);
  });


  it('resolves a Course with zero living contestants immediately', () => {
    const contestants = Array.from({ length: 16 }, (_, index) => fakeContestant(index, index === 0));
    const match = makeMatch(contestants);
    match.startShow();
    match.beginRound();
    for (const contestant of contestants) contestant.body.eliminated = true;
    match.afterPhysics(fakeLevel());
    expect(match.phase).toBe('results');
    expect(match.finalPlacements).toHaveLength(16);
    expect(match.finalPlacements.filter((entry) => entry.qualified)).toHaveLength(8);
    expect(match.finalPlacements.find((entry) => entry.isPlayer)?.qualified).toBe(false);
  });

  it('keeps an eliminated human out of later Rounds even with high progress', () => {
    const contestants = Array.from({ length: 16 }, (_, index) => fakeContestant(index, index === 0));
    const player = contestants[0]!;
    const match = makeMatch(contestants);
    match.startShow();
    match.beginRound();
    player.body.eliminated = true;
    player.eliminatedAt = 1;
    player.progress = 0.99;
    match.finishRound();
    expect(match.finalPlacements.find((entry) => entry.isPlayer)?.qualified).toBe(false);
    match.nextRound();
    expect(match.phase).toBe('defeat');
    expect(match.showResult?.won).toBe(false);
  });

  it('does not promote an idle non-eliminated player over bots that ran further', () => {
    const contestants = Array.from({ length: 16 }, (_, index) => fakeContestant(index, index === 0));
    const match = makeMatch(contestants);
    match.startShow();
    match.beginRound();
    for (const contestant of contestants) {
      if (!contestant.isPlayer) contestant.progress = 0.25 + contestant.id * 0.02;
    }
    match.finishRound();
    expect(match.finalPlacements.find((entry) => entry.isPlayer)?.qualified).toBe(false);
    match.nextRound();
    expect(match.phase).toBe('defeat');
  });

  it('eliminates an idle human on a Course timeout with seven finishers', () => {
    const contestants = Array.from({ length: 16 }, (_, index) => fakeContestant(index, index === 0));
    const match = makeMatch(contestants);
    match.startShow();
    match.beginRound();
    for (const contestant of contestants) {
      if (contestant.id >= 1 && contestant.id <= 7) {
        contestant.finishTime = 30 + contestant.id;
        contestant.status = 'qualified';
        contestant.progress = 1;
      } else if (contestant.id >= 8) {
        contestant.body.eliminated = true;
        contestant.status = 'eliminated';
        contestant.eliminatedAt = 5 + contestant.id;
        contestant.progress = 0.4;
      }
    }
    // The clock, not the win condition, ends the Round.
    match.tick(match.definition.timeLimit);
    expect(match.phase).toBe('results');
    const placements = match.finalPlacements;
    const player = placements.find((entry) => entry.isPlayer);
    expect(placements.filter((entry) => entry.qualified)).toHaveLength(7);
    expect(placements.filter((entry) => entry.qualified).every((entry) => entry.finishTime !== null)).toBe(
      true,
    );
    expect(player?.qualified).toBe(false);
    expect(player?.status).toBe('ELIMINATED');
    expect(match.player.status).toBe('eliminated');
    expect(match.player.body.eliminated).toBe(true);
  });

  it('does not resolve a two-entrant Hexapop on the first step', () => {
    const contestants = [fakeContestant(0, true), fakeContestant(1)];
    const stamps: string[] = [];
    const match = new Match({
      seed: 11,
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
    match.startShow();
    match.jumpToRound(1);
    match.beginRound();
    expect(match.entrantsList).toHaveLength(2);

    match.afterPhysics(fakeLevel());
    expect(match.phase).toBe('playing');
    match.tick(3.9);
    match.afterPhysics(fakeLevel());
    expect(match.phase).toBe('playing');
    expect(stamps).not.toContain('NOT ENOUGH SURVIVORS');

    match.tick(0.2);
    match.afterPhysics(fakeLevel());
    expect(stamps).toContain('NOT ENOUGH SURVIVORS');
    expect(match.phase).toBe('results');
    expect(match.finalPlacements.filter((entry) => entry.qualified)).toHaveLength(2);
  });

  it('marks a Crown Climb timeout winner as won, qualified and not eliminated', () => {
    const contestants = Array.from({ length: 4 }, (_, index) => fakeContestant(index, index === 0));
    const player = contestants[0]!;
    const match = makeMatch(contestants);
    match.startShow();
    match.jumpToRound(2);
    match.beginRound();
    player.body.position.y = 30;
    player.eliminatedAt = 2;
    player.body.eliminated = true;
    for (const contestant of contestants.slice(1)) {
      contestant.body.position.y = 10 + contestant.id;
      contestant.body.eliminated = true;
      contestant.eliminatedAt = 3;
    }
    match.finishRound();
    const winner = match.finalPlacements[0];
    expect(winner?.isPlayer).toBe(true);
    expect(winner?.won).toBe(true);
    expect(winner?.qualified).toBe(true);
    expect(winner?.eliminated).toBe(false);
    expect(player.body.eliminated).toBe(false);
    expect(player.status).toBe('qualified');
    match.nextRound();
    expect(match.phase).toBe('victory');
    expect(match.showResult?.won).toBe(true);
    expect(match.showResult?.winnerName).toBe('YOU');
  });

  it('forces the human to win for accelerated QA and evidence', () => {
    const contestants = Array.from({ length: 16 }, (_, index) => fakeContestant(index, index === 0));
    const match = new Match({
      seed: 9,
      seedLabel: '#00000009',
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
    match.jumpToRound(2);
    match.beginRound();
    match.forcePlayerWin();
    expect(match.phase).toBe('results');
    match.nextRound();
    expect(match.phase).toBe('victory');
    expect(match.showResult?.winnerName).toBe('YOU');
  });

  it('keeps a qualified finisher qualified and celebrating after a post-finish fall', () => {
    const contestants = Array.from({ length: 16 }, (_, index) =>
      fakeContestant(index, index === 0),
    );
    const match = makeMatch(contestants);
    match.startShow();
    match.beginRound();
    const finisher = contestants[3]!;
    finisher.finishTime = 30;
    finisher.status = 'qualified';
    finisher.progress = 1;
    // Simulate a shove off the finish pad after the gate credited the finish.
    finisher.body.eliminated = true;
    let hidden = false;
    finisher.bean.setVisible = (visible: boolean) => {
      if (!visible) hidden = true;
    };
    finisher.bean.setCelebrating = () => undefined;
    match.afterPhysics(fakeLevel());
    expect(finisher.status).toBe('qualified');
    expect(finisher.eliminatedAt).toBeNull();
    expect(hidden).toBe(false);
    expect(finisher.body.frozen).toBe(true);
    match.finishRound();
    expect(match.finalPlacements.find((entry) => entry.id === '3')?.qualified).toBe(true);
  });

  it('drives the HUD from level status and the followed leader, not the dead player', () => {
    const contestants = Array.from({ length: 16 }, (_, index) =>
      fakeContestant(index, index === 0),
    );
    const match = makeMatch(contestants);
    match.startShow();
    match.jumpToRound(1);
    match.beginRound();
    const level = {
      progress: () => 0,
      isAtFinish: () => false,
      crownPosition: undefined,
      status: () => ({
        mode: 'hexapop',
        title: 'HEXAPOP',
        objective: 'Survive the Sugar Rush',
        elapsed: 12,
        timeLimit: 75,
        progress: 0.42,
        progressLabel: '42%',
        metricLabel: 'TILES LEFT',
        metricValue: '68 / 117',
        phase: 'STEADY',
        result: null,
      }),
    } as unknown as Level;

    const hud = match.hud(level);
    expect(hud.progress).toBeCloseTo(0.42, 5);
    expect(hud.progressLabel).toBe('42%');

    const leader = contestants[2]!;
    leader.progress = 0.66;
    (match as unknown as { spectating: Contestant | null }).spectating = leader;
    // Hexapop progress is floor collapse, so it must not switch to a bean height.
    const spectated = match.hud(level);
    expect(spectated.spectating).toBe(true);
    expect(spectated.progress).toBeCloseTo(0.42, 5);
    expect(spectated.progressLabel).toBe('42%');

    // Course progress is avatar-relative: the spectator bar follows the leader.
    match.jumpToRound(0);
    (match as unknown as { spectating: Contestant | null }).spectating = leader;
    const courseHud = match.hud(level);
    expect(courseHud.progress).toBeCloseTo(0.66, 5);
    expect(courseHud.progressLabel).toBe('66%');
  });
});
