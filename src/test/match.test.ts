import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Contestant } from '../game/match/Contestant';
import { Match } from '../game/match/Match';
import { SHOW_ROUNDS } from '../game/match/Director';

function fakeContestant(id: number, isPlayer = false): Contestant {
  const body = {
    position: new Vector3(0, 0, 0),
    eliminated: false,
  };
  return {
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
    applyDifficulty: () => undefined,
    hide: () => undefined,
  } as unknown as Contestant;
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
});
