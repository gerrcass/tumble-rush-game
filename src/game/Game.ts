import {
  ACESFilmicToneMapping,
  Color,
  Fog,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { Bean } from './player/Bean';
import { BeanController, type ControllerFrame } from './player/BeanController';
import { CameraRig } from './player/CameraRig';
import { Input } from './input/Input';
import { PhysicsWorld, FIXED_STEP } from './physics/PhysicsWorld';
import { BeanBody } from './physics/BeanBody';
import { TrainingDeck, type Quality } from './levels/TrainingDeck';
import { PLAYER_LOOK } from './cosmetics';
import { Rng } from './Rng';
import type { TumbleDebugApi } from '../types/debug';
import { clamp } from './util/math';

export type GameState = 'menu' | 'playing' | 'paused' | 'finished';

export interface GameCallbacks {
  onStateChange?: (state: GameState) => void;
  onFinish?: (seconds: number) => void;
  onCheckpoint?: (index: number) => void;
  onFall?: () => void;
  onRespawn?: () => void;
  onTick?: (elapsed: number) => void;
  onContextLost?: () => void;
}

export interface GameOptions {
  mount: HTMLElement;
  touchRoot: HTMLElement;
  seed: number;
  callbacks?: GameCallbacks;
}

export interface GameDebugSource {
  readonly state: GameState;
  readonly seed: number;
  readonly player: BeanBody;
  readonly quality: Quality;
  readonly elapsed: number;
  readonly fps: number;
  setQuality: (quality: Quality) => void;
}

/**
 * Owns the renderer, camera, clock, quality, level, physics and the player bean.
 * Match/show orchestration will layer on top in later tickets; for the vertical
 * slice this is a single Training Deck session.
 */
export class Game {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly world = new PhysicsWorld({ killY: -14 });
  readonly level: TrainingDeck;
  readonly body: BeanBody;
  readonly bean: Bean;
  readonly controller: BeanController;
  readonly rig: CameraRig;
  readonly input: Input;
  readonly seed: number;
  readonly debug: TumbleDebugApi;

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
  private readonly reducedMotion: boolean;

  private currentState: GameState = 'menu';
  private quality: Quality;
  private running = false;
  private raf = 0;
  private lastNow = 0;
  private accumulator = 0;
  private cosmeticTime = 0;
  private elapsed = 0;
  private finishTime = 0;
  private checkpointIndex = 0;
  private respawnTimer = 0;
  private fpsEstimate = 60;

  constructor(options: GameOptions) {
    this.mount = options.mount;
    this.callbacks = options.callbacks ?? {};
    this.seed = options.seed;
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
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = high;
    this.renderer.shadowMap.type = PCFShadowMap;
    const canvas = this.renderer.domElement;
    canvas.className = 'game-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    this.mount.appendChild(canvas);

    this.camera = new PerspectiveCamera(68, 1, 0.1, 260);
    this.scene.background = new Color(0xffd8c2);
    this.scene.fog = new Fog(0xffd9c7, 62, 155);

    const rng = new Rng(this.seed ^ 0x5eed1234);
    this.level = new TrainingDeck(this.seed);
    this.scene.add(this.level.group);
    for (const collider of this.level.colliders) this.world.addCollider(collider);

    this.body = new BeanBody({ position: this.level.startPosition.clone() });
    this.world.addBody(this.body);

    this.bean = new Bean({
      look: PLAYER_LOOK,
      outline: high,
      name: 'YOU',
      phase: rng.float(0, 10),
    });
    this.bean.setMenuMode(true);
    this.scene.add(this.bean.group);

    this.controller = new BeanController(this.body, this.world);
    this.controller.onEvent = (event) => {
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

    this.rig = new CameraRig(this.camera, this.world);
    this.input = new Input(canvas, options.touchRoot);
    this.level.setQuality(this.quality);
    this.bean.setOutlineEnabled(this.quality === 'high');
    this.rig.snapMenu(this.body);

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
        return game.seed;
      },
      get playerPos() {
        return {
          x: game.body.position.x,
          y: game.body.position.y,
          z: game.body.position.z,
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
          x: game.body.velocity.x,
          y: game.body.velocity.y,
          z: game.body.velocity.z,
        };
      },
      get grounded() {
        return game.body.grounded;
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
      setQuality: (quality: Quality) => this.setQuality(quality),
      teleport: (x: number, y: number, z: number) => this.teleport(x, y, z),
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

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Begin (or restart) the Training Deck run. */
  play(): void {
    this.resetRun();
    this.currentState = 'playing';
    this.bean.setMenuMode(false);
    this.rig.snapBehind(this.body);
    this.input.reset();
    this.accumulator = 0;
    this.callbacks.onStateChange?.(this.currentState);
  }

  pause(): void {
    if (this.currentState !== 'playing') return;
    this.currentState = 'paused';
    this.accumulator = 0;
    this.input.reset();
    this.callbacks.onStateChange?.(this.currentState);
  }

  resume(): void {
    if (this.currentState !== 'paused') return;
    this.currentState = 'playing';
    this.accumulator = 0;
    this.input.reset();
    this.callbacks.onStateChange?.(this.currentState);
  }

  togglePause(): void {
    if (this.currentState === 'playing') this.pause();
    else if (this.currentState === 'paused') this.resume();
  }

  restart(): void {
    this.play();
  }

  quitToMenu(): void {
    this.resetRun();
    this.currentState = 'menu';
    this.bean.setMenuMode(true);
    this.rig.snapMenu(this.body);
    this.input.reset();
    this.accumulator = 0;
    this.callbacks.onStateChange?.(this.currentState);
  }

  /** Debug/test-only reposition. Never changes the checkpoint or show state. */
  teleport(x: number, y: number, z: number): void {
    if (this.currentState !== 'playing') return;
    this.respawnTimer = 0;
    this.body.reset(x, y, z);
    this.controller.reset();
    this.bean.setVisible(true);
    this.rig.snapBehind(this.body);
    this.input.reset();
    this.accumulator = 0;
  }

  setQuality(quality: Quality): void {
    this.quality = quality;
    const high = quality === 'high';
    this.renderer.shadowMap.enabled = high;
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    this.level.setQuality(quality);
    this.bean.setOutlineEnabled(high);
    this.resize();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.bean.dispose();
    this.level.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
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

  private resetRun(): void {
    this.body.reset(
      this.level.startPosition.x,
      this.level.startPosition.y,
      this.level.startPosition.z,
    );
    this.controller.reset();
    this.level.resetKinematics();
    this.level.setQuality(this.quality);
    this.bean.setVisible(true);
    this.bean.setMenuMode(false);
    this.checkpointIndex = 0;
    this.respawnTimer = 0;
    this.elapsed = 0;
    this.finishTime = 0;
    this.accumulator = 0;
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
    this.cosmeticTime += dt;

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

    this.rig.update(
      dt,
      this.body,
      view,
      {
        menu: this.currentState === 'menu',
        celebrating: this.currentState === 'finished',
        reducedMotion: this.reducedMotion,
      },
      this.cosmeticTime,
    );
    this.level.animate(this.cosmeticTime, dt);
    this.bean.update(dt, this.body, this.controller, this.cosmeticTime);

    this.renderer.render(this.scene, this.camera);
    this.callbacks.onTick?.(this.elapsed);
  };

  private stepFixed(dt: number, first: boolean): void {
    if (this.currentState !== 'playing') return;

    this.elapsed += dt;
    this.level.step(dt);

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

    this.controller.update(dt, frame);
    this.world.step(dt);
    this.afterPhysics();
  }

  private afterPhysics(): void {
    if (this.body.eliminated || this.body.position.y < this.world.killY) {
      this.beginRespawn();
      return;
    }

    if (this.body.landedThisStep) {
      this.controller.notifyLand(this.body.lastImpactSpeed);
      this.body.landedThisStep = false;
    } else if (this.body.lastImpactSpeed > 12) {
      this.controller.notifyImpact(this.body.lastImpactSpeed);
    }

    if (this.body.grounded) {
      const next = this.level.checkpointFor(this.body.position, this.checkpointIndex);
      if (next !== this.checkpointIndex) {
        this.checkpointIndex = next;
        this.callbacks.onCheckpoint?.(next);
      }
    }

    if (this.level.isAtFinish(this.body.position)) {
      this.finish();
    }
  }

  private beginRespawn(): void {
    if (this.respawnTimer > 0) return;
    this.respawnTimer = 0.85;
    this.body.eliminated = false;
    this.bean.setVisible(false);
    this.input.reset();
    this.rig.addShake(0.14);
    this.callbacks.onFall?.();
  }

  private respawnNow(): void {
    const checkpoint =
      this.level.checkpoints[this.checkpointIndex] ?? this.level.checkpoints[0];
    const position = checkpoint?.position ?? this.level.startPosition;
    this.body.reset(position.x, position.y + 0.04, position.z);
    this.controller.reset();
    this.bean.setVisible(true);
    this.rig.snapBehind(this.body);
    this.input.reset();
    this.callbacks.onRespawn?.();
  }

  private finish(): void {
    if (this.currentState !== 'playing') return;
    this.currentState = 'finished';
    this.finishTime = this.elapsed;
    this.accumulator = 0;
    this.body.velocity.set(0, 0, 0);
    this.controller.reset();
    this.input.reset();
    this.rig.addShake(0.1);
    this.callbacks.onFinish?.(this.finishTime);
    this.callbacks.onStateChange?.(this.currentState);
  }
}
