import {
  ACESFilmicToneMapping,
  Color,
  Fog,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { ControllerFrame } from './player/BeanController';
import { CameraRig } from './player/CameraRig';
import { Input } from './input/Input';
import { PhysicsWorld, FIXED_STEP } from './physics/PhysicsWorld';
import { BeanBody } from './physics/BeanBody';
import {
  DIFFICULTY_PRESETS,
  SHOW_ROUNDS,
  type DifficultyId,
  type RoundPlacement,
  type ShowPhase,
} from './match/Director';
import {
  Match,
  type MatchHud,
  type ShowFxEvent,
  type ShowResult,
  type StampTone,
} from './match/Match';
import { Contestant, createBotProfiles } from './match/Contestant';
import { createBotBrain, createCasualPilot, type BotBrain } from './bots/BotBrain';
import {
  MODE_CATALOGUE,
  type Level,
  type LevelMode,
  type LevelResult,
  type LevelStatus,
  type Quality,
} from './levels/Level';
import { createLevel } from './levels/factory';
import type { Course } from './levels/Course';
import { startPositionsFor } from './levels/startPositions';
import { planShow } from './levels/coursePlan';
import { Rng, formatSeed } from './Rng';
import { AudioEngine, type SfxName } from './audio/AudioEngine';
import { Bursts, particleBudget } from './fx/Bursts';
import type { DebugSpectate, TumbleDebugApi } from '../types/debug';
import { clamp } from './util/math';
import { DEFAULT_LOOK, type BeanLook } from './cosmetics';

export type GameState = 'menu' | 'playing' | 'paused' | 'finished';

export interface GameCallbacks {
  onStateChange?: (state: GameState) => void;
  onFinish?: (result: LevelResult) => void;
  onCheckpoint?: (index: number) => void;
  onFall?: () => void;
  onRespawn?: () => void;
  onTick?: (elapsed: number, status: LevelStatus) => void;
  onContextLost?: () => void;
  onStamp?: (text: string, tone: StampTone) => void;
  onShowPhase?: (phase: ShowPhase) => void;
  onShowEnd?: (result: ShowResult) => void;
  /** Auto quality stepped itself down after sustained low frame rate. */
  onQualityStepDown?: () => void;
}

export interface PlayerIdentity {
  name: string;
  look: BeanLook;
}

export interface GameOptions {
  mount: HTMLElement;
  touchRoot: HTMLElement;
  seed: number;
  mode?: LevelMode;
  identity?: PlayerIdentity;
  callbacks?: GameCallbacks;
}

export interface StartShowOptions {
  seed?: number;
  seedLabel?: string;
  difficulty?: DifficultyId;
  practice?: boolean;
  practiceMode?: LevelMode;
  /**
   * Debug/QA only: keep measuring all three Rounds after the human is out.
   * Normal shows still end on a missed qualification.
   */
  observe?: boolean;
}

const PRACTICE_BOTS = 3;

/**
 * Owns the renderer, camera, clock, quality, physics and the live Show.
 *
 * Game creates every Contestant and keeps the player first in PhysicsWorld so
 * Levels can continue to use bodies[0] for player-facing progress. The Match
 * owns show phases and qualification; Game only steps controllers, the physics
 * world, and presentation.
 */
export class Game {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly world = new PhysicsWorld({ killY: -14 });
  readonly rig: CameraRig;
  readonly input: Input;
  readonly audio: AudioEngine;
  readonly bursts: Bursts;
  readonly contestants: Contestant[] = [];
  readonly debug: TumbleDebugApi;
  player: Contestant;
  match: Match | null = null;
  level: Level;
  mode: LevelMode;
  difficulty: DifficultyId = 'show';
  seedLabel: string;

  private readonly mount: HTMLElement;
  private readonly callbacks: GameCallbacks;
  private readonly abort = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private readonly controllerFrame: ControllerFrame = {
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
  private reducedMotion: boolean;
  private readonly practiceContestants: Contestant[] = [];
  private identity: PlayerIdentity;
  private nameTagsVisible = true;
  private cameraSensitivity = 1;
  private invertY = false;
  private readonly peerBodies: BeanBody[] = [];

  private currentState: GameState = 'menu';
  private quality: Quality;
  private autoQuality = true;
  private autoDropped = false;
  private qualitySampleTime = 0;
  private qualitySampleFrames = 0;
  private running = false;
  private raf = 0;
  private lastNow = 0;
  private accumulator = 0;
  private cosmeticTime = 0;
  private elapsed = 0;
  private checkpointIndex = 0;
  private respawnTimer = 0;
  private fpsEstimate = 60;
  private lastResult: LevelResult | null = null;
  private currentSeed: number;
  private practice = false;
  private spectateBody: BeanBody | null = null;
  private menuMode = true;
  private autopilotMode: 'off' | 'casual' = 'off';
  private casualPilot: BotBrain | null = null;

  constructor(options: GameOptions) {
    this.mount = options.mount;
    this.callbacks = options.callbacks ?? {};
    this.currentSeed = options.seed;
    this.seedLabel = formatSeed(options.seed);
    this.mode = options.mode ?? 'course';
    this.identity = options.identity
      ? { name: options.identity.name, look: { ...options.identity.look } }
      : { name: 'Pip', look: { ...DEFAULT_LOOK } };
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const high = !window.matchMedia('(pointer: coarse)').matches;
    this.quality = high ? 'high' : 'low';

    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.shadowMap.enabled = high;
    this.renderer.shadowMap.type = PCFShadowMap;
    const canvas = this.renderer.domElement;
    canvas.className = 'game-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    this.mount.appendChild(canvas);

    this.camera = new PerspectiveCamera(68, 1, 0.1, 320);
    this.scene.background = new Color(0xffb9a6);
    this.scene.fog = new Fog(0xffc4b5, 105, 245);

    this.audio = new AudioEngine();
    this.audio.bindGesture(window);
    this.bursts = new Bursts(180);
    this.bursts.setBudget(particleBudget(this.quality, this.reducedMotion));
    this.scene.add(this.bursts.mesh);

    this.level = createLevel(this.mode, this.currentSeed);
    this.scene.add(this.level.group);
    for (const collider of this.level.colliders) this.world.addCollider(collider);

    const playerRng = new Rng(this.currentSeed ^ 0x5eed1234);
    this.player = this.createPlayer(playerRng.float(0, 10), high);
    this.player.resetForRound(this.level.startPosition, 0, 'racing');
    this.player.bean.setMenuMode(true);
    this.contestants.push(this.player);

    this.rig = new CameraRig(this.camera, this.world);
    this.rig.setFloor(this.level.cameraFloor);
    this.input = new Input(canvas, options.touchRoot);
    this.level.setQuality(this.quality);
    this.player.bean.setOutlineEnabled(this.quality === 'high');
    this.buildMenuCast();
    this.refreshPeerBodies();
    this.rig.snapMenu(this.player.body);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.mount);
    this.resize();
    this.bindLifecycle();

    const game = this;
    this.debug = {
      get state() {
        return game.currentState;
      },
      get seed() {
        return game.currentSeed;
      },
      get seedLabel() {
        return game.seedLabel;
      },
      get currentMode() {
        return game.mode;
      },
      get playerPos() {
        return {
          x: game.player.body.position.x,
          y: game.player.body.position.y,
          z: game.player.body.position.z,
        };
      },
      get cameraPos() {
        return {
          x: game.camera.position.x,
          y: game.camera.position.y,
          z: game.camera.position.z,
        };
      },
      get velocity() {
        return {
          x: game.player.body.velocity.x,
          y: game.player.body.velocity.y,
          z: game.player.body.velocity.z,
        };
      },
      get grounded() {
        return game.player.body.grounded;
      },
      get quality() {
        return game.quality;
      },
      get elapsed() {
        return game.elapsed;
      },
      get fps() {
        return game.fpsEstimate;
      },
      get audio() {
        return game.audio.getState();
      },
      get renderInfo() {
        const render = game.renderer.info.render;
        return {
          calls: render.calls,
          triangles: render.triangles,
          geometries: game.renderer.info.memory.geometries,
          textures: game.renderer.info.memory.textures,
          particles: game.bursts.activeCount,
        };
      },
      get tileCount() {
        return game.level.tileCount ?? 0;
      },
      get slimeHeight() {
        return game.level.slimeHeight ?? 0;
      },
      get crownPosition() {
        const crown = game.level.crownPosition;
        return crown
          ? { x: crown.x, y: crown.y, z: crown.z }
          : { x: 0, y: 0, z: 0 };
      },
      get levelStatus() {
        return game.level.status();
      },
      get eliminated() {
        return game.player.body.eliminated;
      },
      get winner() {
        return game.match?.showResult?.winnerName ?? game.level.winner ?? null;
      },
      get waypoints() {
        return game.level.waypoints.map((waypoint) => ({
          x: waypoint.position.x,
          y: waypoint.position.y,
          z: waypoint.position.z,
          action: waypoint.action,
          radius: waypoint.radius,
        }));
      },
      get show() {
        const match = game.match;
        if (!match) {
          return {
            active: false,
            phase: null,
            roundIndex: 0,
            roundNumber: 1,
            roundTitle: MODE_CATALOGUE[game.mode].label,
            roundMode: game.mode,
            time: game.elapsed,
            qualified: 0,
            qualifiers: 0,
            remaining: 0,
            spectating: false,
            seedLabel: game.seedLabel,
            difficulty: game.difficulty,
            winner: null,
          };
        }
        const hud = match.hud(game.level);
        return {
          active: true,
          phase: match.phase,
          roundIndex: match.roundIndex,
          roundNumber: hud.roundNumber,
          roundTitle: hud.roundTitle,
          roundMode: match.definition.mode,
          time: hud.time,
          qualified: hud.qualified,
          qualifiers: hud.qualifiers,
          remaining: hud.remaining,
          spectating: hud.spectating,
          seedLabel: hud.seedLabel,
          difficulty: match.difficulty,
          winner: match.showResult?.winnerName ?? null,
        };
      },
      get contestants() {
        const list = game.match?.entrantsList ?? game.contestants;
        return {
          count: list.length,
          names: list.map((contestant) => contestant.name),
          statuses: list.map((contestant) => ({
            id: contestant.id,
            name: contestant.name,
            status: contestant.status,
            eliminated: contestant.body.eliminated,
            placement: contestant.placement,
          })),
          positions: list.map((contestant) => ({
            id: contestant.id,
            name: contestant.name,
            x: contestant.body.position.x,
            y: contestant.body.position.y,
            z: contestant.body.position.z,
            target: contestant.targetLabel,
            grounded: contestant.body.grounded,
            vy: contestant.body.velocity.y,
          })),
          standings: game.match?.standings() ?? [],
          player: game.match?.player.name ?? game.player.name,
        };
      },
      get roundPlacements(): readonly RoundPlacement[] {
        return game.match?.finalPlacements ?? [];
      },
      get autopilot() {
        return game.autopilotMode;
      },
      get spectate(): DebugSpectate {
        const match = game.match;
        const leader = match?.spectating ?? null;
        const camera = game.camera.position;
        let nearest = Infinity;
        let nonTargets = 0;
        for (const contestant of match?.entrantsList ?? []) {
          if (contestant.body.eliminated || contestant.status === 'eliminated') continue;
          const centerY = contestant.body.position.y + 0.75;
          nearest = Math.min(
            nearest,
            Math.hypot(
              camera.x - contestant.body.position.x,
              camera.y - centerY,
              camera.z - contestant.body.position.z,
            ),
          );
          if (
            contestant !== leader &&
            contestant.bean.nameTagVisible &&
            game.nameTagsVisible
          ) {
            nonTargets += 1;
          }
        }
        return {
          active: leader !== null,
          name: leader?.name ?? '',
          seconds: match ? match.hud(game.level).spectateSeconds : 0,
          camera: { x: camera.x, y: camera.y, z: camera.z },
          leader: leader
            ? {
                x: leader.body.position.x,
                y: leader.body.position.y,
                z: leader.body.position.z,
              }
            : null,
          leaderDistance: leader
            ? Number(
                Math.hypot(
                  camera.x - leader.body.position.x,
                  camera.y - (leader.body.position.y + 0.75),
                  camera.z - leader.body.position.z,
                ).toFixed(2),
              )
            : 0,
          leaderTagVisible: leader?.bean.nameTagVisible ?? false,
          nonTargetTagsVisible: nonTargets,
          nearestBeanClearance: Number.isFinite(nearest) ? Number(nearest.toFixed(2)) : 99,
          slimeClearance: Number((camera.y - (game.level.slimeHeight ?? -10)).toFixed(2)),
        };
      },
      get course() {
        if (game.level.mode !== 'course') return null;
        const level = game.level as Course;
        const plan = game.match?.showPlan ?? planShow(game.currentSeed);
        return {
          laps: level.plan.lapCount,
          lapOffsetZ: level.plan.lapOffsetZ,
          lapOffsetY: level.plan.lapOffsetY,
          length: level.plan.courseLength,
          finishZ: level.finishPosition.z,
          finishY: level.finishPosition.y,
          waypointCount: level.waypoints.length,
          routeLabel: plan.routeLabel,
          courseSignature: plan.courseSignature,
          arena: plan.arena,
          signature: plan.signature,
          showLabel: plan.label,
        };
      },
      get plan() {
        const plan = game.match?.showPlan ?? planShow(game.currentSeed);
        return {
          courseSignature: plan.courseSignature,
          lapRoutes: plan.lapRoutes.map((lap) => [...lap]),
          routeLabel: plan.routeLabel,
          arena: plan.arena,
          arenaLabel: plan.arenaLabel,
          signature: plan.signature,
          label: plan.label,
        };
      },
      isAtFinish: (x: number, y: number, z: number) =>
        game.level.isAtFinish(new Vector3(x, y, z)),
      setPlayerAutopilot: (mode: 'off' | 'casual') => this.setPlayerAutopilot(mode),
      eliminateContestant: (name: string) => {
        const target = game.match?.entrantsList.find((contestant) => contestant.name === name);
        if (target) target.body.eliminated = true;
      },
      startCasualRun: (difficulty?: DifficultyId) => this.startCasualRun(difficulty),
      startObservedShow: (difficulty?: DifficultyId) => this.startObservedShow(difficulty),
      setQuality: (quality: Quality) => this.setQuality(quality),
      teleport: (x: number, y: number, z: number) => this.teleport(x, y, z),
      startMode: (mode: LevelMode) => this.startMode(mode),
      finishNow: () => this.finishNow(),
      startShow: (difficulty?: DifficultyId) => this.startShow({ difficulty }),
      startPractice: (mode: LevelMode = 'course') => this.startPractice(mode),
      beginRound: () => this.match?.beginRound(),
      finishRound: () => this.match?.finishRound(),
      nextRound: () => this.match?.nextRound(),
      jumpToRound: (index: number) => this.match?.jumpToRound(index),
      simulate: (seconds: number) => this.simulate(seconds),
      setDifficulty: (difficulty: DifficultyId) => this.setDifficulty(difficulty),
      forcePlayerWin: () => this.match?.forcePlayerWin(),
      skipSpectate: () => this.match?.skipSpectate(),
      setCamera: (yaw: number, pitch: number, distance: number) =>
        this.rig.setCamera(yaw, pitch, distance),
      lookAt: (x: number, y: number, z: number) => this.rig.lookAt(x, y, z),
      clearLookAt: () => this.rig.clearLookAt(),
      playSfx: (name: SfxName) => this.audio.play(name),
      unlockAudio: () => this.audio.unlock(),
    };
  }

  get state(): GameState {
    return this.currentState;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get elapsedTime(): number {
    return this.elapsed;
  }

  get result(): LevelResult | null {
    return this.lastResult;
  }

  get hud(): MatchHud | null {
    return this.match?.hud(this.level) ?? null;
  }

  get isPractice(): boolean {
    return this.practice;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Start a complete three-Round Show. */
  startShow(options: StartShowOptions = {}): void {
    this.leavePause();
    this.blurControls();
    this.ensureIdentity();
    this.setPlayerAutopilot('off');
    this.disposeBots();
    this.match = null;
    this.practice = false;
    this.difficulty = options.difficulty ?? this.difficulty;
    this.currentSeed = options.seed ?? this.currentSeed;
    this.seedLabel = options.seedLabel ?? formatSeed(this.currentSeed);
    this.buildBots(this.currentSeed);
    this.audio.setMusicMode('round');
    this.match = new Match({
      seed: this.currentSeed,
      seedLabel: this.seedLabel,
      difficulty: this.difficulty,
      contestants: this.contestants,
      player: this.player,
      continueWhenPlayerOut: options.observe ?? false,
      callbacks: {
        prepareRound: (index, entrants) => this.prepareRound(index, entrants),
        onStamp: (stamp) => this.callbacks.onStamp?.(stamp.text, stamp.tone),
        onPhase: (phase) => this.callbacks.onShowPhase?.(phase),
        onSpectate: (leader) => {
          const next = leader?.body ?? null;
          const first = next !== null && this.spectateBody === null;
          this.spectateBody = next;
          // Establish the wide shot once, then let the rig lerp to a new
          // leader over a few frames. A hard cut on every lead change broke
          // the dense-pack read and could land the lens inside a rival.
          if (next && first) this.rig.snapSpectate(next);
        },
        onFx: (event) => this.handleShowFx(event),
        onCountdown: (value) => this.handleCountdown(value),
        onShowEnd: (result) => {
          this.currentState = 'finished';
          this.accumulator = 0;
          this.player.controller.reset();
          this.input.reset();
          this.audio.setMusicMode('menu');
          this.audio.play(result.won ? 'crown' : 'eliminate');
          const crownEnding = result.finalRoundMode === 'crown-climb';
          const winner = result.winnerLook;
          const crown = this.level.crownPosition;
          if (crownEnding && winner) {
            // Both a human and a bot crown win get the same ceremony: frame
            // the dais, celebrate the actual winner, and confetti the crown.
            this.spectateBody = winner.body;
            winner.body.frozen = true;
            winner.bean.setVisible(true);
            winner.bean.setCelebrating(true);
            if (crown) {
              this.rig.lookAt(crown.x, crown.y + 0.2, crown.z);
              this.rig.setCamera(this.rig.yaw, (20 * Math.PI) / 180, 11.2);
            }
            this.bursts.spawn(
              'crown',
              crown?.x ?? winner.body.position.x,
              crown?.y ?? winner.body.position.y + 1,
              crown?.z ?? winner.body.position.z,
              1.15,
            );
            this.rig.addShake(0.16);
          } else if (result.won) {
            if (crown) {
              this.rig.lookAt(crown.x, crown.y + 0.2, crown.z);
              this.rig.setCamera(this.rig.yaw, (18 * Math.PI) / 180, 10.5);
            }
            this.bursts.spawn(
              'crown',
              crown?.x ?? winner?.body.position.x ?? this.player.body.position.x,
              crown?.y ?? (winner?.body.position.y ?? this.player.body.position.y) + 1,
              crown?.z ?? winner?.body.position.z ?? this.player.body.position.z,
              1.15,
            );
            this.rig.addShake(0.16);
          }
          this.callbacks.onShowEnd?.(result);
          this.callbacks.onStateChange?.(this.currentState);
        },
      },
    });
    this.spectateBody = null;
    this.menuMode = false;
    this.currentState = 'playing';
    this.player.bean.setMenuMode(false);
    this.match.startShow();
    this.accumulator = 0;
    this.input.reset();
    this.callbacks.onStateChange?.(this.currentState);
  }

  /**
   * Debug/QA only. Installs (or removes) a scripted player brain that fills the
   * same ControllerFrame as human input. It never runs in normal play; the
   * default is off and `startShow` always resets it.
   */
  setPlayerAutopilot(mode: 'off' | 'casual'): void {
    this.autopilotMode = mode;
    this.casualPilot =
      mode === 'casual' && this.match ? createCasualPilot(this.player, this.currentSeed) : null;
  }

  /** Debug/QA: a full observed show played by the scripted casual brain. */
  startCasualRun(difficulty: DifficultyId = 'show'): void {
    this.startShow({ difficulty, observe: true });
    this.setPlayerAutopilot('casual');
  }

  /** Debug/QA: a full observed show with no player input. */
  startObservedShow(difficulty: DifficultyId = 'show'): void {
    this.startShow({ difficulty, observe: true });
  }

  /** Course or Training Deck with respawns and no elimination. */
  startPractice(mode: LevelMode = 'course'): void {
    this.leavePause();
    this.blurControls();
    this.ensureIdentity();
    this.disposeBots();
    this.match = null;
    this.practice = true;
    this.menuMode = false;
    this.installLevel(mode, this.currentSeed);
    this.audio.setMusicMode(mode === 'crown-climb' ? 'final' : 'round');
    this.buildBots(this.currentSeed, true);
    this.practiceContestants.length = 0;
    this.practiceContestants.push(this.player, ...this.contestants.filter((c) => !c.isPlayer));
    this.resetWorldFor([...this.practiceContestants]);
    this.placePracticeContestants();
    this.level.resetKinematics();
    this.player.bean.setVisible(true);
    this.player.bean.setMenuMode(false);
    this.spectateBody = null;
    this.rig.setFloor(this.level.cameraFloor);
    this.rig.clearLookAt();
    this.rig.snapBehind(this.player.body);
    this.checkpointIndex = 0;
    this.respawnTimer = 0;
    this.elapsed = 0;
    this.lastResult = null;
    this.accumulator = 0;
    this.currentState = 'playing';
    this.input.reset();
    this.callbacks.onStateChange?.(this.currentState);
  }

  /** Debug free-play: one player, one Level, no show progression. */
  startMode(mode: LevelMode): void {
    this.leavePause();
    this.blurControls();
    this.ensureIdentity();
    this.disposeBots();
    this.match = null;
    this.practice = false;
    this.menuMode = false;
    this.installLevel(mode, this.currentSeed);
    this.audio.setMusicMode(mode === 'crown-climb' ? 'final' : 'round');
    this.match = null;
    this.resetWorldFor([this.player]);
    this.player.resetForRound(this.level.startPosition, 0, 'racing');
    this.player.bean.setVisible(true);
    this.player.bean.setMenuMode(false);
    this.level.resetKinematics();
    this.spectateBody = null;
    this.rig.setFloor(this.level.cameraFloor);
    this.rig.clearLookAt();
    this.rig.snapBehind(this.player.body);
    this.checkpointIndex = 0;
    this.respawnTimer = 0;
    this.elapsed = 0;
    this.lastResult = null;
    this.accumulator = 0;
    this.currentState = 'playing';
    this.input.reset();
    this.callbacks.onStateChange?.(this.currentState);
  }

  play(mode: LevelMode = this.mode): void {
    this.startMode(mode);
  }

  pause(): void {
    if (this.currentState !== 'playing') return;
    if (this.match && this.match.phase !== 'playing') return;
    this.currentState = 'paused';
    this.accumulator = 0;
    this.audio.setPaused(true);
    this.input.reset();
    this.callbacks.onStateChange?.(this.currentState);
  }

  resume(): void {
    if (this.currentState !== 'paused') return;
    this.currentState = 'playing';
    this.accumulator = 0;
    this.audio.setPaused(false);
    this.input.reset();
    this.callbacks.onStateChange?.(this.currentState);
  }

  togglePause(): void {
    if (this.currentState === 'playing') this.pause();
    else if (this.currentState === 'paused') this.resume();
  }

  /**
   * A restart from pause must leave the paused state before installing the new
   * Round. Otherwise startShow/startPractice early-return on `paused`, the
   * pause overlay has already closed, and the show soft-locks on touch.
   */
  private leavePause(): void {
    if (this.currentState === 'paused') this.currentState = 'playing';
    this.audio.setPaused(false);
    this.input.reset();
  }

  restart(): void {
    this.leavePause();
    if (this.match) {
      this.startShow({ seed: this.currentSeed, seedLabel: this.seedLabel, difficulty: this.difficulty });
    } else if (this.practice) {
      this.startPractice(this.mode);
    } else {
      this.startMode(this.mode);
    }
  }

  quitToMenu(): void {
    this.disposeBots();
    this.match = null;
    this.practice = false;
    this.spectateBody = null;
    this.currentState = 'menu';
    this.ensureIdentity();
    this.installLevel('course', this.currentSeed);
    this.resetWorldFor([this.player]);
    this.player.resetForRound(this.level.startPosition, 0, 'waiting');
    this.player.bean.setVisible(true);
    this.player.bean.setMenuMode(true);
    this.level.resetKinematics();
    this.menuMode = true;
    this.elapsed = 0;
    this.audio.setMusicMode('menu');
    this.audio.setPaused(false);
    this.rig.clearLookAt();
    this.rig.setFloor(this.level.cameraFloor);
    this.buildMenuCast();
    this.refreshPeerBodies();
    this.rig.snapMenu(this.player.body);
    this.input.reset();
    this.accumulator = 0;
    this.callbacks.onStateChange?.(this.currentState);
  }

  /** Update the live player cosmetics from the profile between shows. */
  setIdentity(name: string, look: BeanLook): void {
    const changed = this.identity.name !== name || !sameLook(this.identity.look, look);
    this.identity = { name, look: { ...look } };
    if (!changed) return;
    if (this.currentState === 'menu') {
      this.replacePlayer();
      this.player.resetForRound(this.level.startPosition, 0, 'waiting');
      this.player.bean.setMenuMode(true);
      this.resetWorldFor(this.contestants);
      this.refreshPeerBodies();
      this.rig.snapMenu(this.player.body);
    }
  }

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    this.bursts.setBudget(particleBudget(this.quality, enabled));
  }

  /** Live mix from the profile. Applied immediately, including while paused. */
  setAudioSettings(settings: { musicVolume: number; sfxVolume: number; muted: boolean }): void {
    this.audio.setSettings(settings);
  }

  setNameTagsVisible(visible: boolean): void {
    this.nameTagsVisible = visible;
  }

  setCameraPreferences(sensitivity: number, invertY: boolean): void {
    this.cameraSensitivity = sensitivity;
    this.invertY = invertY;
    this.rig.setViewPreferences(sensitivity, invertY);
  }

  setQualitySetting(setting: 'auto' | 'high' | 'low'): void {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (setting === 'auto') {
      this.autoQuality = true;
      this.applyQuality(coarse || this.autoDropped ? 'low' : 'high');
      return;
    }
    this.autoQuality = false;
    this.autoDropped = false;
    this.applyQuality(setting);
  }

  /** Debug/test-only reposition. Never changes the checkpoint or show state. */
  teleport(x: number, y: number, z: number): void {
    if (this.currentState !== 'playing' && this.currentState !== 'paused') return;
    this.respawnTimer = 0;
    this.player.body.reset(x, y, z);
    this.player.controller.reset();
    this.player.bean.setVisible(true);
    this.rig.snapBehind(this.player.body);
    this.input.reset();
    this.accumulator = 0;
  }

  finishNow(): void {
    if (this.currentState !== 'playing') return;
    if (this.match) {
      this.match.forcePlayerWin();
      return;
    }
    this.finishLevel(this.level.finishNow());
  }

  setDifficulty(difficulty: DifficultyId): void {
    this.difficulty = difficulty;
    this.match?.setDifficulty(difficulty);
    const preset = DIFFICULTY_PRESETS[difficulty];
    for (const contestant of this.contestants) contestant.applyDifficulty(preset);
  }

  /** Debug accelerator: run the fixed loop without waiting wall-clock time. */
  simulate(seconds: number): { steps: number; phase: string; round: number } {
    if (this.currentState === 'paused') this.currentState = 'playing';
    const total = Math.min(60 * 60 * 8, Math.max(1, Math.floor(seconds / FIXED_STEP)));
    let steps = 0;
    for (let i = 0; i < total; i += 1) {
      this.stepFixed(FIXED_STEP, steps === 0);
      steps += 1;
      if (this.match?.phase === 'victory' || this.match?.phase === 'defeat') break;
      if (this.currentState === 'finished') break;
    }
    this.accumulator = 0;
    this.input.reset();
    return {
      steps,
      phase: this.match?.phase ?? this.currentState,
      round: this.match?.roundIndex ?? 0,
    };
  }

  /** Explicit quality choice (settings/debug) turns automatic stepping off. */
  setQuality(quality: Quality): void {
    this.autoQuality = false;
    this.applyQuality(quality);
  }

  private applyQuality(quality: Quality): void {
    this.quality = quality;
    const high = quality === 'high';
    this.renderer.shadowMap.enabled = high;
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    this.level.setQuality(quality);
    this.bursts.setBudget(particleBudget(quality, this.reducedMotion));
    this.player.bean.setOutlineEnabled(high);
    for (const contestant of this.contestants) {
      if (!contestant.isPlayer) contestant.bean.setOutlineEnabled(false);
    }
    this.resize();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.audio.dispose();
    this.bursts.dispose();
    this.disposeBots();
    this.player.dispose();
    this.level.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private createPlayer(phase: number, outline: boolean): Contestant {
    const player = new Contestant({
      id: 0,
      name: this.identity.name,
      look: { ...this.identity.look },
      isPlayer: true,
      world: this.world,
      scene: this.scene,
      outline,
      phase,
    });
    player.controller.onEvent = (event) => {
      const sfx: Partial<Record<typeof event.type, SfxName>> = {
        jump: 'jump',
        land: 'land',
        dive: 'dive',
        grab: 'grab',
        shove: 'shove',
        stumble: 'hit',
      };
      const cue = sfx[event.type];
      if (cue) this.audio.play(cue);
      if (event.type === 'land') {
        this.rig.addShake(clamp(event.strength * 0.012, 0.02, 0.16));
      } else if (event.type === 'dive') {
        this.rig.addShake(0.12);
      } else if (event.type === 'stumble') {
        this.rig.addShake(0.08);
      } else if (event.type === 'shove') {
        this.rig.addShake(0.06);
      }
    };
    return player;
  }

  private ensureIdentity(): void {
    if (this.player.name === this.identity.name && sameLook(this.player.look, this.identity.look)) {
      return;
    }
    this.replacePlayer();
  }

  private replacePlayer(): void {
    const old = this.player;
    const index = this.contestants.indexOf(old);
    this.world.removeBody(old.body);
    old.dispose();
    const player = this.createPlayer(new Rng(this.currentSeed ^ 0x5eed1234).float(0, 10), this.quality === 'high');
    this.player = player;
    if (index >= 0) this.contestants[index] = player;
    else this.contestants.unshift(player);
    player.bean.setOutlineEnabled(this.quality === 'high');
    if (this.spectateBody === old.body) this.spectateBody = null;
  }

  /**
   * A lively menu needs a cast, not one lonely bean. These are ordinary
   * Contestants on the Course start deck, removed before any real Show begins.
   */
  private buildMenuCast(): void {
    const profiles = createBotProfiles(this.currentSeed).slice(0, 4);
    const origin = this.level.startPosition;
    const offsets: ReadonlyArray<readonly [number, number]> = [
      [1.8, -1.8],
      [3.6, -0.9],
      [-1.7, -1.5],
      [0.8, -2.9],
    ];
    const rng = new Rng((this.currentSeed ^ 0xca57) >>> 0);
    for (let i = 0; i < profiles.length; i += 1) {
      const profile = profiles[i]!;
      const offset = offsets[i] ?? ([0, -1] as const);
      const bot = new Contestant({
        id: 100 + i,
        name: profile.name,
        look: profile.look,
        isPlayer: false,
        world: this.world,
        scene: this.scene,
        outline: false,
        phase: rng.float(0, 10),
        skill: profile.baseSkill,
        reaction: profile.baseReaction,
        aggression: profile.baseAggression,
        mistakeChance: profile.baseMistakeChance,
      });
      bot.bean.setOutlineEnabled(false);
      bot.bean.setContactShadowVisible(false);
      bot.resetForRound(
        new Vector3(origin.x + offset[0], origin.y + 0.02, origin.z + offset[1]),
        i % 3,
        'waiting',
      );
      bot.bean.setMenuMode(true);
      this.contestants.push(bot);
    }
  }

  private refreshPeerBodies(): void {
    this.peerBodies.length = 0;
    for (const contestant of this.contestants) this.peerBodies.push(contestant.body);
  }

  private buildBots(seed: number, practice = false): void {
    const profiles = createBotProfiles(seed).slice(0, practice ? PRACTICE_BOTS : undefined);
    const rng = new Rng((seed ^ 0xb07f00d) >>> 0);
    for (let i = 0; i < profiles.length; i += 1) {
      const profile = profiles[i]!;
      const bot = new Contestant({
        id: i + 1,
        name: profile.name,
        look: profile.look,
        isPlayer: false,
        world: this.world,
        scene: this.scene,
        outline: false,
        phase: rng.float(0, 10),
        skill: profile.baseSkill,
        reaction: profile.baseReaction,
        aggression: profile.baseAggression,
        mistakeChance: profile.baseMistakeChance,
      });
      bot.bean.setOutlineEnabled(false);
      bot.bean.setContactShadowVisible(false);
      this.contestants.push(bot);
    }
    this.refreshPeerBodies();
  }

  private disposeBots(): void {
    for (let i = this.contestants.length - 1; i >= 0; i -= 1) {
      const contestant = this.contestants[i];
      if (!contestant || contestant.isPlayer) continue;
      this.world.removeBody(contestant.body);
      contestant.dispose();
      this.contestants.splice(i, 1);
    }
    this.practiceContestants.length = 0;
    this.refreshPeerBodies();
  }

  private prepareRound(index: number, entrants: readonly Contestant[]): void {
    const definition = SHOW_ROUNDS[index] ?? SHOW_ROUNDS[0]!;
    this.audio.setMusicMode(index >= SHOW_ROUNDS.length - 1 ? 'final' : 'round');
    this.installLevel(definition.mode, this.currentSeed);
    this.level.resetKinematics();
    this.resetWorldFor(entrants);
    const positions = startPositionsFor(this.level, definition.mode, entrants, this.currentSeed);
    for (let i = 0; i < entrants.length; i += 1) {
      const contestant = entrants[i]!;
      const position = positions[i] ?? this.level.startPosition;
      contestant.resetForRound(position, i % 3, 'racing');
      if (!contestant.isPlayer) {
        contestant.brain = createBotBrain(definition.mode, contestant, this.currentSeed);
      }
    }
    this.player.brain = null;
    this.spectateBody = null;
    this.elapsed = 0;
    this.rig.setFloor(this.level.cameraFloor);
    this.rig.clearLookAt();
    this.rig.snapBehind(this.player.body);
    this.accumulator = 0;
  }

  private placePracticeContestants(): void {
    const active = this.practiceContestants;
    const positions = startPositionsFor(this.level, this.mode, active, this.currentSeed);
    for (let i = 0; i < active.length; i += 1) {
      const contestant = active[i]!;
      contestant.resetForRound(positions[i] ?? this.level.startPosition, i % 3, 'racing');
      if (!contestant.isPlayer) {
        contestant.brain = createBotBrain(this.mode, contestant, this.currentSeed);
      }
    }
  }

  private resetWorldFor(entrants: readonly Contestant[]): void {
    this.world.bodies.length = 0;
    const ordered = [...entrants].sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer));
    for (const contestant of ordered) {
      contestant.body.eliminated = false;
      this.world.addBody(contestant.body);
    }
  }

  private installLevel(mode: LevelMode, seed: number): void {
    this.level.group.removeFromParent();
    this.level.dispose();
    this.world.clearColliders();
    this.mode = mode;
    this.level = createLevel(mode, seed);
    this.scene.add(this.level.group);
    for (const collider of this.level.colliders) this.world.addCollider(collider);
    this.level.setQuality(this.quality);
    this.rig.setFloor(this.level.cameraFloor);
    this.rig.setSpectateArena(
      mode === 'hexapop',
      this.level.startPosition.x,
      this.level.startPosition.z,
    );
    this.world.killY = this.level.killY;
  }

  private bindLifecycle(): void {
    const signal = this.abort.signal;
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden && this.currentState === 'playing') this.pause();
      },
      { signal },
    );
    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        if (this.currentState === 'playing') this.pause();
        this.callbacks.onContextLost?.();
      },
      { signal },
    );
  }

  private resize(): void {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private blurControls(): void {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);

    const rawDelta = (now - this.lastNow) / 1000;
    this.lastNow = now;
    const dt = Math.min(Math.max(rawDelta, 0), 0.05);
    if (rawDelta > 0) {
      this.fpsEstimate += (1 / rawDelta - this.fpsEstimate) * 0.05;
    }
    if (this.autoQuality && this.quality === 'high' && this.currentState === 'playing') {
      this.qualitySampleTime += rawDelta;
      this.qualitySampleFrames += 1;
      if (this.qualitySampleTime >= 4) {
        const average = this.qualitySampleFrames / this.qualitySampleTime;
        this.qualitySampleTime = 0;
        this.qualitySampleFrames = 0;
        if (average < 46) {
          this.autoDropped = true;
          this.autoQuality = false;
          this.applyQuality('low');
          this.callbacks.onQualityStepDown?.();
        }
      }
    } else {
      this.qualitySampleTime = 0;
      this.qualitySampleFrames = 0;
    }
    this.cosmeticTime += dt;

    this.input.setGameplayActive(
      this.currentState === 'playing' && (!this.match || this.match.phase === 'playing'),
    );
    this.input.poll(dt);
    const view = this.input.takeViewDelta();

    if (this.currentState === 'playing' && this.input.pausePressed) {
      this.pause();
    }

    if (this.currentState === 'playing') {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < 4) {
        this.stepFixed(FIXED_STEP, steps === 0);
        this.accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (steps > 0) this.input.clearPressed();
      if (this.accumulator > FIXED_STEP * 4) this.accumulator = 0;
    } else {
      this.accumulator = 0;
      this.input.clearPressed();
    }

    if (this.peerBodies.length !== this.contestants.length) this.refreshPeerBodies();
    this.rig.setPeers(this.peerBodies);
    this.rig.setViewPreferences(this.cameraSensitivity, this.invertY);
    this.rig.setFloor(this.level.cameraFloor);
    if (this.spectateBody?.eliminated) {
      const next = this.match?.entrantsList.find(
        (contestant) => !contestant.body.eliminated && contestant.eliminatedAt === null,
      );
      if (next) this.spectateBody = next.body;
      else if (this.match?.phase === 'playing') this.match.finishRound();
    }
    const focus = this.spectateBody ?? this.player.body;
    this.rig.update(
      dt,
      focus,
      view,
      {
        menu: this.currentState === 'menu' || this.menuMode,
        celebrating: this.currentState === 'finished',
        reducedMotion: this.reducedMotion,
        spectating: this.spectateBody !== null,
      },
      this.cosmeticTime,
    );
    this.level.animate(this.cosmeticTime, dt);
    for (const contestant of this.contestants) {
      if (!contestant.body.eliminated || contestant.isPlayer) {
        contestant.bean.update(dt, contestant.body, contestant.controller, this.cosmeticTime);
        const tagDistance = this.camera.position.distanceTo(contestant.body.position);
        const spectateOnly =
          this.spectateBody !== null && !contestant.isPlayer && contestant.body !== this.spectateBody;
        if (!this.nameTagsVisible || (this.menuMode && !contestant.isPlayer) || spectateOnly) {
          contestant.bean.setNameTagVisible(false);
        } else {
          contestant.bean.setNameTagDistance(tagDistance, contestant.isPlayer);
        }
      }
    }

    this.bursts.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.callbacks.onTick?.(this.elapsed, this.level.status());
  };

  private handleShowFx(event: ShowFxEvent): void {
    const fallY = this.level.killY + 0.5;
    const y = Math.max(event.y, fallY);
    const distance = Math.hypot(
      this.camera.position.x - event.x,
      this.camera.position.y - y,
      this.camera.position.z - event.z,
    );
    const near = event.player || distance <= 26;
    switch (event.kind) {
      case 'splat':
        if (near) this.bursts.spawn('splat', event.x, y, event.z, event.player ? 1.2 : 0.8);
        if (event.player) {
          this.audio.play('eliminate');
          this.rig.addShake(0.16);
        } else if (distance < 17) {
          this.audio.play('splat');
        }
        break;
      case 'qualify':
        if (near) this.bursts.spawn('qualify', event.x, event.y, event.z, 0.7);
        break;
      case 'finish':
        this.bursts.spawn('finish', event.x, event.y, event.z, 1);
        this.audio.play('qualify');
        this.rig.addShake(0.1);
        break;
      case 'crown':
        this.bursts.spawn('crown', event.x, event.y, event.z, 1);
        this.audio.play('crown');
        this.rig.addShake(0.14);
        break;
    }
  }

  private handleCountdown(value: number): void {
    if (value === 0) {
      this.audio.play('go');
      this.callbacks.onStamp?.('TUMBLE!', 'good');
    } else {
      this.audio.play('countdown');
    }
  }

  private stepFixed(dt: number, first: boolean): void {
    if (this.currentState !== 'playing') return;

    if (this.match) {
      this.match.tick(dt);
      if (this.match.phase !== 'playing' || this.currentState !== 'playing') return;
      this.stepShow(dt, first);
      return;
    }
    if (this.practice) {
      this.stepPractice(dt, first);
      return;
    }
    this.stepFreePlay(dt, first);
  }

  private stepShow(dt: number, first: boolean): void {
    const match = this.match;
    if (!match) return;
    this.elapsed = match.roundTime;
    this.world.killY = this.level.killY;
    this.level.step(dt, this.world.bodies);
    const active = match.entrantsList;
    const leaderProgress = active.reduce(
      (max, contestant) => (contestant.body.eliminated ? max : Math.max(max, contestant.progress)),
      0,
    );
    const humanProgress = active.includes(this.player)
      ? this.player.body.eliminated
        ? null
        : this.player.progress
      : null;
    for (const contestant of active) {
      if (contestant.body.eliminated || contestant.finishTime !== null) continue;
      if (contestant.isPlayer) {
        if (this.autopilotMode === 'casual' && this.level.mode === 'course') {
          const pilot = this.casualPilot ?? createCasualPilot(contestant, this.currentSeed);
          this.casualPilot = pilot;
          contestant.controller.update(
            dt,
            pilot.think({
              level: this.level,
              body: contestant.body,
              contestants: active,
              leaderProgress,
              humanProgress,
              dt,
            }),
          );
          continue;
        }
        this.controllerFrame.cameraYaw = this.rig.yaw;
        const input = this.input.readFrame();
        this.controllerFrame.moveX = input.moveX;
        this.controllerFrame.moveZ = input.moveZ;
        this.controllerFrame.jumpPressed = first && input.jumpPressed;
        this.controllerFrame.jumpHeld = input.jumpHeld;
        this.controllerFrame.divePressed = first && input.divePressed;
        this.controllerFrame.grabPressed = first && input.grabPressed;
        this.controllerFrame.grabHeld = input.grabHeld;
        this.controllerFrame.emotePressed = first && input.emotePressed;
        contestant.controller.update(dt, this.controllerFrame);
      } else {
        const brain =
          contestant.brain ?? createBotBrain(this.level.mode, contestant, this.currentSeed);
        if (!brain) continue;
        contestant.brain = brain;
        const frame = brain.think({
          level: this.level,
          body: contestant.body,
          contestants: active,
          leaderProgress,
          humanProgress,
          dt,
        });
        contestant.controller.update(dt, frame);
      }
    }
    this.world.step(dt);
    this.handlePlayerImpact();
    match.afterPhysics(this.level);
  }

  private stepPractice(dt: number, first: boolean): void {
    this.elapsed += dt;
    this.world.killY = this.level.killY;
    this.level.step(dt, this.world.bodies);
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawnNow();
      return;
    }
    const active = this.practiceContestants;
    const leaderProgress = active.reduce(
      (max, contestant) => (contestant.body.eliminated ? max : Math.max(max, contestant.progress)),
      0,
    );
    const humanProgress = this.player.body.eliminated ? null : this.player.progress;
    for (const contestant of active) {
      if (contestant.body.eliminated || contestant.finishTime !== null) continue;
      if (contestant.isPlayer) {
        this.controllerFrame.cameraYaw = this.rig.yaw;
        const input = this.input.readFrame();
        this.controllerFrame.moveX = input.moveX;
        this.controllerFrame.moveZ = input.moveZ;
        this.controllerFrame.jumpPressed = first && input.jumpPressed;
        this.controllerFrame.jumpHeld = input.jumpHeld;
        this.controllerFrame.divePressed = first && input.divePressed;
        this.controllerFrame.grabPressed = first && input.grabPressed;
        this.controllerFrame.grabHeld = input.grabHeld;
        this.controllerFrame.emotePressed = first && input.emotePressed;
        contestant.controller.update(dt, this.controllerFrame);
      } else {
        const brain =
          contestant.brain ?? createBotBrain(this.level.mode, contestant, this.currentSeed);
        if (!brain) continue;
        contestant.brain = brain;
        const frame = brain.think({
          level: this.level,
          body: contestant.body,
          contestants: active,
          leaderProgress,
          humanProgress,
          dt,
        });
        contestant.controller.update(dt, frame);
      }
    }
    this.world.step(dt);
    if (this.player.body.eliminated) {
      this.beginRespawn();
      return;
    }
    for (const contestant of active) {
      if (!contestant.isPlayer && contestant.body.eliminated && contestant.bean.group.visible) {
        contestant.bean.setVisible(false);
      }
      if (!contestant.body.eliminated) {
        contestant.updateProgress(this.level.progress(contestant.body.position));
      }
    }
    this.handlePlayerImpact();
    if (this.player.body.grounded) {
      const next = this.level.checkpointFor(this.player.body.position, this.checkpointIndex);
      if (next !== this.checkpointIndex) {
        this.checkpointIndex = next;
        this.callbacks.onCheckpoint?.(next);
      }
    }
    if (this.level.isAtFinish(this.player.body.position)) {
      this.finishLevel({
        kind: 'finish',
        title: 'DECK CLEARED!',
        detail: 'Practice makes perfect. Or at least makes a very confident bean.',
        time: this.elapsed,
        winner: null,
      });
    }
  }

  private stepFreePlay(dt: number, first: boolean): void {
    this.elapsed += dt;
    this.world.killY = this.level.killY;
    this.level.step(dt, this.world.bodies);
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawnNow();
      return;
    }

    const input = this.input.readFrame();
    const frame = this.controllerFrame;
    frame.moveX = input.moveX;
    frame.moveZ = input.moveZ;
    frame.jumpPressed = first && input.jumpPressed;
    frame.jumpHeld = input.jumpHeld;
    frame.divePressed = first && input.divePressed;
    frame.grabPressed = first && input.grabPressed;
    frame.grabHeld = input.grabHeld;
    frame.emotePressed = first && input.emotePressed;
    frame.cameraYaw = this.rig.yaw;

    this.player.controller.update(dt, frame);
    this.world.step(dt);
    this.afterFreePlayPhysics();
  }

  private handlePlayerImpact(): void {
    const body = this.player.body;
    if (body.eliminated) return;
    if (body.landedThisStep) {
      this.player.controller.notifyLand(body.lastImpactSpeed);
      body.landedThisStep = false;
    } else if (body.lastImpactSpeed > 12) {
      this.player.controller.notifyImpact(body.lastImpactSpeed);
    }
  }

  private afterFreePlayPhysics(): void {
    const body = this.player.body;
    if (body.eliminated || body.position.y < this.world.killY) {
      body.eliminated = true;
      if (this.level.respawnAllowed) {
        this.beginRespawn();
      } else {
        this.eliminate();
      }
      return;
    }
    this.handlePlayerImpact();
    if (body.grounded && this.level.respawnAllowed) {
      const next = this.level.checkpointFor(body.position, this.checkpointIndex);
      if (next !== this.checkpointIndex) {
        this.checkpointIndex = next;
        this.callbacks.onCheckpoint?.(next);
      }
    }
    if (this.level.isAtFinish(body.position)) {
      this.finishLevel(this.level.finishNow());
    }
  }

  private beginRespawn(): void {
    if (this.respawnTimer > 0) return;
    this.respawnTimer = 0.85;
    this.player.body.eliminated = false;
    this.player.bean.setVisible(false);
    this.input.reset();
    this.rig.addShake(0.14);
    this.callbacks.onFall?.();
  }

  private respawnNow(): void {
    const checkpoint =
      this.level.checkpoints[this.checkpointIndex] ?? this.level.checkpoints[0];
    const position = checkpoint?.position ?? this.level.startPosition;
    this.player.body.reset(position.x, position.y + 0.04, position.z);
    this.player.controller.reset();
    this.player.bean.setVisible(true);
    this.rig.snapBehind(this.player.body);
    this.input.reset();
    this.callbacks.onRespawn?.();
  }

  private eliminate(): void {
    if (this.currentState !== 'playing') return;
    const detail =
      this.mode === 'hexapop'
        ? 'The slime got you. The floor was never on your side.'
        : this.mode === 'crown-climb'
          ? 'The slime caught up. Gravity remains undefeated.'
          : 'You fell off the Course. The canyon says hello.';
    this.finishLevel({
      kind: 'eliminated',
      title: 'ELIMINATED',
      detail,
      time: this.elapsed,
      winner: null,
    });
  }

  private finishLevel(result: LevelResult): void {
    if (this.currentState !== 'playing') return;
    this.currentState = 'finished';
    const finalResult = { ...result, roundTitle: result.roundTitle ?? this.level.title };
    this.lastResult = finalResult;
    this.accumulator = 0;
    this.player.body.velocity.set(0, 0, 0);
    this.player.controller.reset();
    this.input.reset();
    this.rig.addShake(0.1);
    this.callbacks.onFinish?.(finalResult);
    this.callbacks.onStateChange?.(this.currentState);
  }
}

function sameLook(a: BeanLook, b: BeanLook): boolean {
  return (
    a.colorId === b.colorId &&
    a.patternId === b.patternId &&
    a.hatId === b.hatId &&
    a.emoteId === b.emoteId
  );
}
