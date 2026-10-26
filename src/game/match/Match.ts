import type { Level, LevelMode } from '../levels/Level';
import type { Contestant } from './Contestant';
import {
  DIFFICULTY_PRESETS,
  SHOW_ROUNDS,
  resolveRound,
  type DifficultyId,
  type RoundDefinition,
  type RoundPlacement,
  type ShowPhase,
} from './Director';
import { clamp } from '../util/math';

export type StampTone = 'good' | 'bad' | 'normal';

export interface MatchStamp {
  text: string;
  tone: StampTone;
}

export interface ShowResult {
  won: boolean;
  /**
   * Null only when a Round ended without a champion. The documented case is a
   * Crown Climb total wipe: nobody touched the crown and every finalist was
   * eliminated, so the Show ends in defeat with no winner to name.
   */
  winnerName: string | null;
  winnerLook: Contestant | null;
  playerPlacement: number;
  roundsQualified: number;
  totalTime: number;
  seedLabel: string;
  /** The Round that actually ended the Show (Crown Climb means a crown). */
  finalRoundMode: LevelMode;
  finalRoundLabel: string;
}

export interface RoundHistory {
  definition: RoundDefinition;
  placements: RoundPlacement[];
}

export type ShowFxKind = 'qualify' | 'finish' | 'crown' | 'splat';

/** Presentation event: Game turns it into a particle burst and/or an SFX. */
export interface ShowFxEvent {
  kind: ShowFxKind;
  name: string;
  player: boolean;
  x: number;
  y: number;
  z: number;
}

export interface MatchCallbacks {
  /** Install the Level, place the entrants and reset the physics bodies. */
  prepareRound: (roundIndex: number, entrants: readonly Contestant[]) => void;
  onStamp: (stamp: MatchStamp) => void;
  onPhase: (phase: ShowPhase) => void;
  onSpectate: (leader: Contestant | null) => void;
  onShowEnd: (result: ShowResult) => void;
  /** Optional presentation hooks; audio/FX are not required to run the Show. */
  onFx?: (event: ShowFxEvent) => void;
  /** 3, 2, 1 during the countdown, then 0 for TUMBLE!. */
  onCountdown?: (value: number) => void;
}

export interface MatchOptions {
  seed: number;
  seedLabel: string;
  difficulty: DifficultyId;
  contestants: readonly Contestant[];
  player: Contestant;
  callbacks: MatchCallbacks;
  /**
   * Debug/QA measurement only. When true, an eliminated or non-qualifying
   * human does not end the Show: the next Round fields the bots that did
   * qualify. Normal play leaves this false and a missed qualification still
   * ends the Show immediately.
   */
  continueWhenPlayerOut?: boolean;
}

export interface MatchHud {
  phase: ShowPhase;
  roundNumber: number;
  roundTitle: string;
  objective: string;
  time: number;
  timeLimit: number;
  qualified: number;
  qualifiers: number;
  remaining: number;
  total: number;
  metricLabel: string;
  metricValue: string;
  phaseLabel: string;
  progress: number;
  progressLabel: string;
  spectating: boolean;
  spectateName: string;
  /** Seconds since the human was eliminated; the skip action unlocks at 3. */
  spectateSeconds: number;
  playerStatus: 'RACING' | 'QUALIFIED' | 'ELIMINATED' | 'WAITING';
  seedLabel: string;
}

const INTRO_SECONDS = 2.1;
const COUNTDOWN_SECONDS = 3.15;
const RESULTS_SECONDS = 5;
const SPECTATE_SWITCH_SECONDS = 1.5;
/** Let a tiny Hexapop field play briefly before skipping it. */
const HEXAPOP_GRACE = 4;
/**
 * The Sugar Rush is the survival Round's fourth act, not an optional extra.
 * When a full four-Tumbler qualifying field is already safe, hold the result
 * for the 45 s ring drop and its one-second warning, then resolve. A field
 * that has already lost a slot (< qualifiers alive) still resolves at once.
 */
const HEXAPOP_SUGAR_RUSH_SECONDS = 45;
const HEXAPOP_RUSH_SETTLE_SECONDS = HEXAPOP_SUGAR_RUSH_SECONDS + 1.15;

/**
 * Show Director: owns Rounds, qualification, advancement, spectating and the
 * end of the Show. It never integrates physics and never draws anything; Game
 * reports completed fixed steps and the App reads the exposed HUD record.
 */
export class Match {
  readonly seed: number;
  readonly seedLabel: string;
  readonly contestants: readonly Contestant[];
  readonly player: Contestant;
  difficulty: DifficultyId;

  phase: ShowPhase = 'intro';
  roundIndex = 0;
  roundTime = 0;
  introTime = INTRO_SECONDS;
  countdown = COUNTDOWN_SECONDS;
  resultsTimer = RESULTS_SECONDS;
  history: RoundHistory[] = [];
  showResult: ShowResult | null = null;
  spectating: Contestant | null = null;

  private readonly callbacks: MatchCallbacks;
  private readonly continueWhenPlayerOut: boolean;
  private entrants: Contestant[] = [];
  private finishers = new Set<string>();
  private winnerId: string | null = null;
  private sugarRushStamp = false;
  private spectateTimer = 0;
  private spectateElapsed = 0;
  private underfilledStamp = false;
  private totalTime = 0;
  private countdownStep = -1;

  constructor(options: MatchOptions) {
    this.seed = options.seed;
    this.seedLabel = options.seedLabel;
    this.difficulty = options.difficulty;
    this.contestants = options.contestants;
    this.player = options.player;
    this.callbacks = options.callbacks;
    this.continueWhenPlayerOut = options.continueWhenPlayerOut ?? false;
    this.applyDifficulty();
  }

  get definition(): RoundDefinition {
    return SHOW_ROUNDS[this.roundIndex] ?? SHOW_ROUNDS[0]!;
  }

  get entrantsList(): readonly Contestant[] {
    return this.entrants;
  }

  get isPlaying(): boolean {
    return this.phase === 'playing';
  }

  get playerEliminated(): boolean {
    return this.player.body.eliminated && !this.player.finishTime;
  }

  get finalPlacements(): readonly RoundPlacement[] {
    return this.history[this.history.length - 1]?.placements ?? [];
  }

  startShow(): void {
    this.history = [];
    this.showResult = null;
    this.roundIndex = 0;
    this.roundTime = 0;
    this.introTime = INTRO_SECONDS;
    this.countdown = COUNTDOWN_SECONDS;
    this.countdownStep = -1;
    this.resultsTimer = RESULTS_SECONDS;
    this.totalTime = 0;
    this.sugarRushStamp = false;
    this.winnerId = null;
    this.spectating = null;
    this.callbacks.onSpectate(null);
    this.phase = 'intro';
    this.entrants = [...this.contestants];
    this.beginRoundSetup(0);
  }

  setDifficulty(difficulty: DifficultyId): void {
    this.difficulty = difficulty;
    this.applyDifficulty();
  }

  /** Debug/QA: skip the intro and start the current Round immediately. */
  beginRound(): void {
    if (this.phase !== 'intro' && this.phase !== 'countdown') return;
    this.startPlaying();
  }

  /** Debug/QA: end the current Round now and show its results. */
  finishRound(): void {
    if (this.phase !== 'playing') return;
    this.resolveRound();
  }

  /** Debug/QA/UI: advance from results, or skip the countdown. */
  nextRound(): void {
    if (this.phase === 'intro' || this.phase === 'countdown') {
      this.startPlaying();
      return;
    }
    if (this.phase === 'playing') {
      this.resolveRound();
      return;
    }
    if (this.phase === 'results') this.advanceFromResults();
  }

  /** Debug/QA: jump directly to a Round with a plausible field. */
  jumpToRound(index: number): void {
    const bounded = clamp(Math.round(index), 0, SHOW_ROUNDS.length - 1);
    this.roundIndex = bounded;
    this.roundTime = 0;
    this.introTime = INTRO_SECONDS;
    this.countdown = COUNTDOWN_SECONDS;
    this.countdownStep = -1;
    this.winnerId = null;
    this.finishers.clear();
    this.sugarRushStamp = false;
    this.spectating = null;
    this.callbacks.onSpectate(null);
    const definition = this.definition;
    const field = this.pickField(definition.starters);
    this.phase = 'intro';
    this.beginRoundSetup(bounded, field);
  }

  skipSpectate(): void {
    if (this.phase === 'playing' && this.spectating) this.resolveRound();
  }

  /**
   * Debug: force the human through the current Round. This uses the show
   * rules (finish order / survivors / crown) rather than a separate result.
   */
  forcePlayerWin(): void {
    if (this.phase !== 'playing') {
      if (this.phase === 'results') this.advanceFromResults();
      return;
    }
    this.player.body.eliminated = false;
    this.player.bean.setVisible(true);
    this.player.status = 'racing';
    if (this.definition.mode === 'course') {
      this.player.finishTime = Math.max(0.001, this.roundTime);
      this.player.status = 'qualified';
      this.player.progress = 1;
      this.player.body.frozen = true;
      this.player.bean.setCelebrating(true);
      this.finishers.add(String(this.player.id));
      this.callbacks.onStamp({ text: 'QUALIFIED!', tone: 'good' });
    } else if (this.definition.mode === 'hexapop') {
      this.player.body.reset(0, 0.43, 0);
      this.player.bean.setVisible(true);
      for (const contestant of this.entrants) {
        if (contestant === this.player) continue;
        contestant.status = 'eliminated';
        contestant.eliminatedAt = this.roundTime;
        contestant.body.eliminated = true;
        contestant.bean.setVisible(false);
      }
    } else {
      this.winnerId = String(this.player.id);
      this.player.finishTime = this.roundTime;
      this.callbacks.onStamp({ text: 'CROWNED!', tone: 'good' });
    }
    this.resolveRound();
  }

  /** Fixed-rate show clock. Game calls this once per physics step. */
  tick(dt: number): void {
    if (this.phase === 'intro') {
      this.introTime -= dt;
      if (this.introTime <= 0) {
        this.phase = 'countdown';
        this.countdown = COUNTDOWN_SECONDS;
        this.countdownStep = 3;
        this.callbacks.onCountdown?.(3);
        this.callbacks.onPhase(this.phase);
      }
      return;
    }
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const step = Math.max(0, Math.ceil(this.countdown - 0.5));
      if (step !== this.countdownStep) {
        this.countdownStep = step;
        this.callbacks.onCountdown?.(step);
      }
      if (this.countdown <= 0) this.startPlaying();
      return;
    }
    if (this.phase === 'playing') {
      this.roundTime += dt;
      if (this.definition.mode === 'hexapop' && !this.sugarRushStamp && this.roundTime >= 45) {
        this.sugarRushStamp = true;
        this.callbacks.onStamp({ text: 'SUGAR RUSH!', tone: 'bad' });
      }
      if (this.roundTime >= this.definition.timeLimit) this.resolveRound(true);
      return;
    }
    if (this.phase === 'results') {
      this.resultsTimer -= dt;
      if (this.resultsTimer <= 0) this.advanceFromResults();
    }
  }

  /**
   * Called by Game after PhysicsWorld.step(). Records finishes and
   * eliminations, starts spectating for an eliminated human, and resolves the
   * Round as soon as its advancement condition is met.
   */
  afterPhysics(level: Level): void {
    if (this.phase !== 'playing') return;
    const definition = this.definition;

    for (const contestant of this.entrants) {
      if (contestant.finishTime !== null) {
        // A finish is final. A later shove off the finish pad must never turn
        // a QUALIFIED row into ELIMINATED or switch the human to spectate.
        // Pin the body and leave the bean cheering on the gate.
        contestant.body.eliminated = false;
        contestant.body.frozen = true;
        contestant.body.velocity.set(0, 0, 0);
        if (contestant.status !== 'qualified' || contestant.eliminatedAt !== null) {
          contestant.status = 'qualified';
          contestant.eliminatedAt = null;
          contestant.bean.setVisible(true);
          contestant.bean.setCelebrating(true);
        }
        contestant.progress = 1;
        continue;
      }
      if (contestant.body.eliminated) {
        if (!contestant.eliminatedAt && contestant.status !== 'eliminated') {
          contestant.eliminatedAt = this.roundTime;
          contestant.status = 'eliminated';
          contestant.bean.setVisible(false);
          this.emitFx('splat', contestant);
          if (contestant.isPlayer) {
            this.callbacks.onStamp({ text: 'ELIMINATED!', tone: 'bad' });
            this.startSpectating();
          }
        }
        continue;
      }
      contestant.updateProgress(level.progress(contestant.body.position));
      contestant.height = contestant.body.position.y;
      contestant.distanceToCrown = level.crownPosition
        ? Math.hypot(
            contestant.body.position.x - level.crownPosition.x,
            contestant.body.position.z - level.crownPosition.z,
          )
        : 0;

      if (definition.mode === 'course') {
        if (contestant.finishTime === null && level.isAtFinish(contestant.body.position)) {
          contestant.finishTime = this.roundTime;
          contestant.status = 'qualified';
          contestant.eliminatedAt = null;
          contestant.progress = 1;
          contestant.body.velocity.set(0, 0, 0);
          contestant.body.frozen = true;
          contestant.bean.setCelebrating(true);
          this.finishers.add(String(contestant.id));
          this.emitFx(contestant.isPlayer ? 'finish' : 'qualify', contestant);
          if (contestant.isPlayer) {
            this.callbacks.onStamp({ text: 'QUALIFIED!', tone: 'good' });
          }
        }
      } else if (definition.mode === 'crown-climb') {
        if (contestant.finishTime === null && level.isAtFinish(contestant.body.position)) {
          contestant.finishTime = this.roundTime;
          this.winnerId = String(contestant.id);
          this.emitFx('crown', contestant);
          this.callbacks.onStamp(
            contestant.isPlayer
              ? { text: 'CROWNED!', tone: 'good' }
              : { text: `${contestant.name.toUpperCase()} TAKES THE CROWN!`, tone: 'normal' },
          );
          this.resolveRound();
          return;
        }
      }
    }

    // A follow-cam must never stay on a Tumbler that just fell. Switch on the
    // same step; if nobody is left, resolve the Round instead of staring at slime.
    if (
      this.spectating &&
      (this.spectating.body.eliminated ||
        this.spectating.eliminatedAt !== null ||
        this.spectating.finishTime !== null)
    ) {
      const leader = this.currentLeader();
      if (!leader) {
        this.resolveRound();
        return;
      }
      this.spectating = leader;
      this.spectateTimer = 0;
      this.callbacks.onSpectate(leader);
    } else if (this.spectating) {
      this.spectateElapsed += 1 / 60;
      this.spectateTimer += 1 / 60;
      if (this.spectateTimer >= SPECTATE_SWITCH_SECONDS) {
        this.spectateTimer = 0;
        const leader = this.currentLeader();
        if (leader && leader !== this.spectating) {
          this.spectating = leader;
          this.callbacks.onSpectate(leader);
        }
      }
    }

    const living = this.entrants.filter(
      (contestant) => !contestant.body.eliminated && contestant.eliminatedAt === null,
    ).length;
    if (living === 0) {
      this.resolveRound();
      return;
    }

    if (definition.mode === 'course') {
      if (this.finishers.size >= definition.qualifiers) this.resolveRound();
      return;
    }
    if (definition.mode === 'hexapop') {
      const alive = this.entrants.filter(
        (contestant) => !contestant.body.eliminated && contestant.eliminatedAt === null,
      );
      // A small field must not resolve on the first physics step just because
      // it starts at or below the qualifier count. Play a short grace, then
      // either settle after a real elimination or advance the underfilled
      // field with a readable stamp. A two-bean Round still shows its tiles.
      const underfilled = this.entrants.length <= definition.qualifiers;
      if (underfilled && !this.underfilledStamp && this.roundTime >= HEXAPOP_GRACE) {
        this.underfilledStamp = true;
        this.callbacks.onStamp({ text: 'NOT ENOUGH SURVIVORS', tone: 'normal' });
      }
      const hasElimination = this.entrants.some(
        (contestant) => contestant.body.eliminated || contestant.status === 'eliminated',
      );
      const fullField = this.entrants.length > definition.qualifiers;
      const sugarRushSettled = this.roundTime >= HEXAPOP_RUSH_SETTLE_SECONDS;
      if (
        this.roundTime >= HEXAPOP_GRACE &&
        (hasElimination || underfilled) &&
        alive.length <= definition.qualifiers &&
        (alive.length < definition.qualifiers || !fullField || sugarRushSettled)
      ) {
        this.resolveRound();
      }
    }
  }

  hud(level: Level): MatchHud {
    const definition = this.definition;
    const status = level.status();
    const alive = this.entrants.filter(
      (contestant) => contestant.status !== 'eliminated' && !contestant.body.eliminated,
    ).length;
    const finished = this.entrants.filter((contestant) => contestant.finishTime !== null).length;
    const qualified =
      this.phase === 'results' || this.phase === 'victory' || this.phase === 'defeat'
        ? this.finalPlacements.filter((placement) => placement.qualified).length
        : finished;
    const spectating = this.spectating !== null;
    const followed = this.spectating ?? this.player;
    // Arena progress is floor collapse, not one bean's height, so Hexapop
    // keeps its level label even while spectating. Course/final progress is
    // avatar-relative and must follow the leader, not the dead player.
    const useLeaderProgress = spectating && definition.mode !== 'hexapop';
    const progress = useLeaderProgress ? followed.progress : status.progress;
    const progressLabel = useLeaderProgress
      ? `${Math.round(progress * 100)}%`
      : status.progressLabel;
    const playerStatus =
      this.player.eliminatedAt !== null
        ? 'ELIMINATED'
        : this.player.finishTime !== null
          ? 'QUALIFIED'
          : 'RACING';
    return {
      phase: this.phase,
      roundNumber: this.roundIndex + 1,
      roundTitle: definition.label,
      objective: definition.objective,
      time: this.roundTime,
      timeLimit: definition.timeLimit,
      qualified,
      qualifiers: definition.qualifiers,
      remaining: alive,
      total: this.entrants.length,
      metricLabel: status.metricLabel,
      metricValue: status.metricValue,
      phaseLabel: spectating ? `SPECTATING · ${this.spectating?.name ?? ''}` : status.phase,
      progress,
      progressLabel,
      spectating,
      spectateName: this.spectating?.name ?? '',
      spectateSeconds: this.spectateElapsed,
      playerStatus,
      seedLabel: this.seedLabel,
    };
  }

  /** Live standings for HUD/debug; placement is null until results resolve. */
  standings(): Array<{
    id: number;
    name: string;
    isPlayer: boolean;
    status: string;
    progress: number;
    placement: number | null;
  }> {
    const placed = new Map(this.finalPlacements.map((entry) => [entry.id, entry.placement]));
    return [...this.entrants]
      .sort((a, b) => {
        const placementA = placed.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER;
        const placementB = placed.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER;
        if (placementA !== placementB) return placementA - placementB;
        return b.progress - a.progress || b.body.position.y - a.body.position.y;
      })
      .map((contestant) => ({
        id: contestant.id,
        name: contestant.name,
        isPlayer: contestant.isPlayer,
        status:
          contestant.status === 'eliminated'
            ? 'ELIMINATED'
            : contestant.finishTime !== null
              ? 'QUALIFIED'
              : 'RACING',
        progress: contestant.progress,
        placement: placed.get(String(contestant.id)) ?? null,
      }));
  }

  private startPlaying(): void {
    this.phase = 'playing';
    this.roundTime = 0;
    this.winnerId = null;
    this.spectateTimer = 0;
    this.spectateElapsed = 0;
    this.underfilledStamp = false;
    if (this.countdownStep !== 0) {
      this.countdownStep = 0;
      this.callbacks.onCountdown?.(0);
    }
    this.callbacks.onPhase(this.phase);
  }

  private beginRoundSetup(index: number, field?: readonly Contestant[]): void {
    const definition = SHOW_ROUNDS[index] ?? SHOW_ROUNDS[0]!;
    this.entrants = field ? [...field] : this.pickField(definition.starters);
    this.entrants.sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer) || a.id - b.id);
    this.finishers.clear();
    this.spectateElapsed = 0;
    this.underfilledStamp = false;
    for (const contestant of this.contestants) {
      if (!this.entrants.includes(contestant)) {
        contestant.status = 'waiting';
        contestant.hide();
      } else {
        contestant.status = 'racing';
        contestant.finishTime = null;
        contestant.eliminatedAt = null;
      }
    }
    this.callbacks.prepareRound(index, this.entrants);
    this.callbacks.onPhase(this.phase);
  }

  private pickField(starters: number): Contestant[] {
    if (this.roundIndex === 0) return [...this.contestants].slice(0, starters);
    const player = this.player;
    const others = this.contestants
      .filter((contestant) => contestant !== player)
      .sort((a, b) => b.skill - a.skill || a.id - b.id);
    return [player, ...others.slice(0, Math.max(0, starters - 1))];
  }

  private resolveRound(timedOut = false): void {
    if (this.phase !== 'playing') return;
    const definition = this.definition;
    const performances = this.entrants.map((contestant) => ({
      id: String(contestant.id),
      name: contestant.name,
      isPlayer: contestant.isPlayer,
      finishTime: contestant.finishTime,
      progress: contestant.progress,
      eliminated: contestant.status === 'eliminated' || contestant.body.eliminated,
      eliminatedAt: contestant.eliminatedAt,
      won: this.winnerId === String(contestant.id),
      height: contestant.body.position.y,
      distanceToCrown: contestant.distanceToCrown,
    }));
    const placements = resolveRound(definition, performances, { timedOut });
    // Crown Climb promotes a champion only when the top row actually earned it:
    // a finisher who touched the crown, or the highest living finalist on the
    // timeout-height safety net. A total wipe has no winner; naming the last
    // eliminated bean would revive it and put "takes the crown" on a corpse.
    if (definition.mode === 'crown-climb' && placements.length > 0) {
      const champion = placements[0]!;
      if (champion.finishTime !== null || !champion.eliminated) {
        champion.won = true;
        champion.qualified = true;
        champion.status = 'QUALIFIED';
        if (champion.finishTime !== null) {
          // A bean that crossed the trigger but was shoved off afterwards is a
          // finisher, not a wipe casualty. Never do this for a non-finisher.
          champion.eliminated = false;
          champion.eliminatedAt = null;
        }
      } else {
        // Resolve the documented no-winner/draw: `resolveRound`'s total-wipe
        // backfill may have marked a dead bean qualified, so clear it here.
        // The Show-end UI reads winnerName === null instead of inventing one.
        for (const placement of placements) {
          placement.qualified = false;
          placement.status = 'ELIMINATED';
        }
      }
    }
    for (const placement of placements) {
      const contestant = this.entrants.find((entry) => String(entry.id) === placement.id);
      if (!contestant) continue;
      contestant.placement = placement.placement;
      contestant.status = placement.qualified ? 'qualified' : 'eliminated';
      if (definition.mode === 'crown-climb' && placement.won) {
        // A living timeout champion is already un-eliminated; only a real
        // finisher may have its eliminated flag cleared.
        if (contestant.finishTime !== null || !contestant.body.eliminated) {
          contestant.eliminatedAt = null;
          contestant.body.velocity?.set(0, 0, 0);
        }
        if (contestant.finishTime !== null) contestant.body.eliminated = false;
      }
      if (!placement.qualified) contestant.body.eliminated = true;
    }
    this.history.push({ definition, placements });
    this.totalTime += this.roundTime;
    this.phase = 'results';
    this.resultsTimer = RESULTS_SECONDS;
    this.spectating = null;
    this.spectateElapsed = 0;
    this.callbacks.onSpectate(null);
    this.callbacks.onPhase(this.phase);
  }

  private advanceFromResults(): void {
    if (this.phase !== 'results') return;
    const last = this.history[this.history.length - 1];
    if (!last) return;
    const playerEntry = last.placements.find((entry) => entry.isPlayer);
    const playerQualified = Boolean(playerEntry?.qualified);
    const lastRound = this.roundIndex >= SHOW_ROUNDS.length - 1;
    // Normal play: a missed qualification ends the Show. The pacing harness
    // opts into an observed show so it can measure all three Rounds even when
    // its idle human is out of the Course. That switch is debug-only.
    if (lastRound || (!playerQualified && !this.continueWhenPlayerOut)) {
      this.finishShow(playerQualified && lastRound, last, playerEntry);
      return;
    }
    this.roundIndex += 1;
    this.phase = 'intro';
    this.introTime = INTRO_SECONDS;
    this.countdown = COUNTDOWN_SECONDS;
    this.countdownStep = -1;
    this.roundTime = 0;
    this.winnerId = null;
    this.sugarRushStamp = false;
    this.spectating = null;
    this.callbacks.onSpectate(null);
    const qualified = last.placements
      .filter((entry) => entry.qualified)
      .map((entry) => this.contestants.find((contestant) => String(contestant.id) === entry.id))
      .filter((entry): entry is Contestant => Boolean(entry));
    this.beginRoundSetup(this.roundIndex, qualified);
  }

  private finishShow(
    won: boolean,
    lastRound: RoundHistory,
    playerEntry: RoundPlacement | undefined,
  ): void {
    // A Crown Climb with no champion must stay a no-winner result. The other
    // Rounds keep the historical last-row fallback so a show always has a head
    // in the results card, but a dead finalist is never named as the crowned
    // Tumbler.
    const winnerEntry =
      lastRound.placements.find((entry) => entry.qualified) ??
      (lastRound.definition.mode === 'crown-climb' ? undefined : lastRound.placements[0]);
    const winner =
      winnerEntry && won
        ? this.player
        : winnerEntry
          ? (this.contestants.find((contestant) => String(contestant.id) === winnerEntry.id) ??
            null)
          : null;
    const roundsQualified = this.history.filter((history) =>
      history.placements.some((entry) => entry.isPlayer && entry.qualified),
    ).length;
    const result: ShowResult = {
      won,
      winnerName: winner?.name ?? null,
      winnerLook: winner,
      playerPlacement: playerEntry?.placement ?? this.entrants.length,
      roundsQualified,
      totalTime: this.totalTime,
      seedLabel: this.seedLabel,
      finalRoundMode: lastRound.definition.mode,
      finalRoundLabel: lastRound.definition.label,
    };
    this.showResult = result;
    this.phase = won ? 'victory' : 'defeat';
    this.callbacks.onShowEnd(result);
    this.callbacks.onPhase(this.phase);
  }

  private startSpectating(): void {
    const leader = this.currentLeader();
    this.spectating = leader;
    this.spectateTimer = 0;
    this.spectateElapsed = 0;
    this.callbacks.onSpectate(leader);
  }

  private currentLeader(): Contestant | null {
    let leader: Contestant | null = null;
    for (const contestant of this.entrants) {
      // A finished Course bot is frozen at 100% and must never be followed
      // while the pack is still racing. Finished/frozen is not "living".
      if (
        contestant.body.eliminated ||
        contestant.eliminatedAt !== null ||
        contestant.finishTime !== null
      ) {
        continue;
      }
      if (!leader || contestant.progress > leader.progress + 0.02) leader = contestant;
      else if (
        Math.abs(contestant.progress - leader.progress) <= 0.02 &&
        contestant.body.position.y > leader.body.position.y
      ) {
        leader = contestant;
      }
    }
    return leader;
  }

  private emitFx(kind: ShowFxEvent['kind'], contestant: Contestant): void {
    if (!this.callbacks.onFx) return;
    const position = contestant.body.position;
    this.callbacks.onFx({
      kind,
      name: contestant.name,
      player: contestant.isPlayer,
      x: position.x,
      y: position.y,
      z: position.z,
    });
  }

  private applyDifficulty(): void {
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    for (const contestant of this.contestants) contestant.applyDifficulty(preset);
  }
}

/** Used by the App to label the daily/quick seed without importing Rng. */
export function roundMode(index: number): LevelMode {
  return SHOW_ROUNDS[index]?.mode ?? 'course';
}

/** Re-exported for tests that prefer the show contract over internal state. */
export type { RoundPlacement } from './Director';
