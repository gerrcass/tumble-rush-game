import {
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Texture,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Rng } from '../Rng';
import type { BeanBody } from '../physics/BeanBody';
import {
  createBoxCollider,
  createCylinderCollider,
  moveCollider,
  type Collider,
} from '../physics/Collider';
import {
  disposeObject,
  makeArrowTexture,
  makeBalloon,
  makeBeltTexture,
  makeBuntingLine,
  makeCheckerTexture,
  makeCloud,
  makeIsland,
  makePlatform,
  makePole,
  makeSign,
  makeSky,
} from './common';
import { Confetti } from '../fx/Confetti';
import { makeToonMaterial } from '../util/toon';
import { clamp } from '../util/math';
import type {
  Checkpoint,
  Level,
  LevelMode,
  LevelResult,
  LevelStatus,
  Quality,
  Waypoint,
} from './Level';

export type { Quality };

interface MovingPlatform {
  collider: Collider;
  visual: Group;
  baseX: number;
  baseZ: number;
  amplitude: number;
  speed: number;
  phase: number;
}

interface Drifter {
  group: Group;
  baseX: number;
  baseY: number;
  phase: number;
  drift: number;
  speed: number;
}

interface CheckpointMarker {
  group: Group;
  phase: number;
}

/**
 * Training Deck — the phase-one playground and tutorial space.
 *
 * Layout (all authored, with seeded dressing):
 *   start platform → 4 u gap → runway with a wall → 3.4 u gap → moving
 *   platform → conveyor → bounce pad → raised checkerboard finish deck.
 *
 * The level builds geometry and colliders. It does not own game state: the
 * physics world stores the colliders and the Game resets the bean. Kinematic
 * movement happens in `step()` so physics always sees the platform delta.
 */
export class TrainingDeck implements Level {
  readonly mode: LevelMode = 'training';
  readonly title = 'TRAINING DECK';
  readonly objective = 'Reach the finish gate';
  readonly group = new Group();
  readonly colliders: Collider[] = [];
  readonly startPosition = new Vector3(0, 0.02, 11);
  readonly finishPosition = new Vector3(0, 3, -34.5);
  readonly respawnAllowed = true;
  readonly killY = -14;
  readonly cameraFloor = 0.55;
  readonly waypoints: readonly Waypoint[] = [
    { position: new Vector3(0, 0.02, 11), action: 'run', radius: 1 },
    { position: new Vector3(0, 0.02, 6.5), action: 'jump', radius: 1.2 },
    { position: new Vector3(0, 0.02, 0.5), action: 'run', radius: 1 },
    { position: new Vector3(0, 0.02, -6.5), action: 'jump', radius: 1.2 },
    { position: new Vector3(0, 0.02, -10.5), action: 'ride', radius: 1.2 },
    { position: new Vector3(0, 0.02, -14), action: 'jump', radius: 1.2 },
    { position: new Vector3(0, 0.02, -19), action: 'ride', radius: 1.5 },
    { position: new Vector3(0, 0.02, -26), action: 'jump', radius: 1.4 },
    { position: new Vector3(0, 0.02, -27.5), action: 'jump', radius: 1.3 },
    { position: new Vector3(0, 3.02, -34.5), action: 'run', radius: 1.5 },
  ];
  readonly checkpoints: readonly Checkpoint[] = [
    {
      position: new Vector3(0, 0.03, 11),
      minZ: 6.5,
      maxZ: 15.5,
      maxY: 1.5,
    },
    {
      position: new Vector3(0, 0.03, 0.5),
      minZ: -5.5,
      maxZ: 2.5,
      maxY: 1.5,
    },
    {
      position: new Vector3(0, 0.03, -17),
      minZ: -24,
      maxZ: -14,
      maxY: 1.5,
    },
    {
      position: new Vector3(0, 0.03, -26),
      minZ: -30,
      maxZ: -25,
      maxY: 2.2,
    },
  ];

  private readonly seed: number;
  private readonly ownedTextures = new Set<Texture>();
  private readonly moving: MovingPlatform;
  private readonly confetti: Confetti;
  private readonly beltTexture = makeBeltTexture(2, 4);
  private readonly directional: DirectionalLight;
  private readonly cloudDrifters: Drifter[] = [];
  private readonly balloons: Drifter[] = [];
  private readonly checkpointMarkers: CheckpointMarker[] = [];
  private readonly padVisual = new Group();
  private readonly finishSign = new Group();
  private elapsed = 0;
  private bodyProgress = 0;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const rng = new Rng(this.seed);
    this.ownedTextures.add(this.beltTexture);


    this.group.add(makeSky());

    const hemi = new HemisphereLight(0xffefdd, 0x86cfff, 0.62);
    this.group.add(hemi);

    this.directional = new DirectionalLight(0xfff1d2, 1.35);
    this.directional.position.set(18, 28, 10);
    this.directional.castShadow = true;
    this.directional.shadow.mapSize.set(1024, 1024);
    this.directional.shadow.camera.left = -32;
    this.directional.shadow.camera.right = 32;
    this.directional.shadow.camera.top = 32;
    this.directional.shadow.camera.bottom = -32;
    this.directional.shadow.camera.near = 1;
    this.directional.shadow.camera.far = 90;
    this.directional.shadow.bias = -0.00035;
    this.directional.shadow.normalBias = 0.02;
    this.directional.target.position.set(0, 0, -12);
    this.group.add(this.directional);
    this.group.add(this.directional.target);

    // Start deck.
    this.addPlatform(0, 11, 9, 9, 0xfff6e5, 0x59d9b0, 0xff6b6b);
    this.addBox(0, -0.5, 11, 4.5, 0.5, 4.5, 'solid');

    // Runway and the wall that teaches collide-and-slide.
    this.addPlatform(0, -1.5, 8, 8, 0xfff6e5, 0x57c7ff, 0xffc145);
    this.addBox(0, -0.5, -1.5, 4, 0.5, 4, 'solid');
    this.buildWall();

    // Moving platform.
    const movingVisual = makePlatform(3.2, 3.2, 0xffc145, 0xff6b6b, 0xfff6e5);
    movingVisual.position.set(0, 0, -10.5);
    this.group.add(movingVisual);
    const movingCollider = this.addBox(0, -0.5, -10.5, 1.6, 0.5, 1.6, 'solid');
    this.moving = {
      collider: movingCollider,
      visual: movingVisual,
      baseX: 0,
      baseZ: -10.5,
      amplitude: 2.25,
      speed: 0.72,
      phase: rng.float(0, Math.PI * 2),
    };
    // Capture the seeded starting offset so the first physics step has no
    // discontinuity and no velocity spike.
    const startX = this.moving.baseX + Math.sin(this.moving.phase) * this.moving.amplitude;
    movingCollider.position.x = startX;
    movingCollider.prevPosition.x = startX;
    movingVisual.position.x = startX;
    this.addRail(movingVisual, 1.5, 1.5, 0xfff6e5);

    // Conveyor.
    this.addPlatform(0, -19, 8, 10, 0xffffff, 0xa78bfa, 0xffc145, this.beltTexture);
    this.addBox(0, -0.5, -19, 4, 0.5, 5, 'conveyor', new Vector3(0, 0, 3.1));
    this.buildConveyorRails();

    // Bounce platform and the pad itself.
    this.addPlatform(0, -27.5, 6, 4, 0x59d9b0, 0x57c7ff, 0xffc145);
    this.addBox(0, -0.5, -27.5, 3, 0.5, 2, 'solid');
    this.buildBouncePad();
    this.addCylinder(0, 0.16, -27.5, 1.2, 0.32, 'bounce', 15.5);

    // Raised finish deck with a checkerboard top.
    const checker = makeCheckerTexture('#fff6e5', '#ff6b6b', 2, 2);
    this.addPlatform(0, -34.5, 9, 6, 0xffffff, 0x59d9b0, 0xffc145, checker, 3);
    this.addBox(0, 2.5, -34.5, 4.5, 0.5, 3, 'solid');
    this.buildFinishGate();

    // Checkpoints as little candy rings on the route.
    this.addCheckpointMarker(0, 0.02, 0.5, 0xffc145, 0);
    this.addCheckpointMarker(0, 0.02, -17, 0x59d9b0, 1);
    this.addCheckpointMarker(0, 0.02, -26, 0x57c7ff, 2);

    // Bunting and signage.
    this.buildBunting(0, 6.4, 8.4, 4.35, 0);
    this.buildBunting(0, -33.1, 7.4, 3.2, 3);
    this.buildStartDecals();

    // Floating candy islands, clouds, balloons, confetti.
    const islandPositions: ReadonlyArray<readonly [number, number, number, number]> = [
      [-30, 1, -24, 5.5],
      [32, -3, -40, 7.5],
      [-23, -7, 18, 4.5],
      [26, 5, 10, 5],
      [-42, -4, -48, 6.5],
      [42, 2, -8, 4],
    ];
    for (const [x, y, z, radius] of islandPositions) {
      const island = makeIsland(radius, rng);
      island.position.set(x, y, z);
      this.group.add(island);
    }

    for (let i = 0; i < 11; i += 1) {
      const cloud = makeCloud(rng.float(1.2, 2.6), rng);
      const x = rng.float(-46, 46);
      const y = rng.float(8, 22);
      const z = rng.float(-58, 25);
      cloud.position.set(x, y, z);
      this.group.add(cloud);
      this.cloudDrifters.push({
        group: cloud,
        baseX: x,
        baseY: y,
        phase: rng.float(0, Math.PI * 2),
        drift: rng.float(0.5, 2.4),
        speed: rng.float(0.03, 0.09),
      });
    }
    // Low haze clouds below the deck make falling read as a long drop.
    for (let i = 0; i < 5; i += 1) {
      const cloud = makeCloud(rng.float(2.5, 4.5), rng);
      cloud.position.set(rng.float(-35, 35), rng.float(-12, -7), rng.float(-30, 20));
      this.group.add(cloud);
    }

    for (let i = 0; i < 4; i += 1) {
      const balloon = makeBalloon([0xff6b6b, 0xffc145, 0x59d9b0, 0xa78bfa][i]!);
      const x = rng.float(-16, 16);
      const y = rng.float(7, 13);
      const z = rng.float(-44, 4);
      balloon.position.set(x, y, z);
      balloon.scale.setScalar(rng.float(0.7, 1.15));
      this.group.add(balloon);
      this.balloons.push({
        group: balloon,
        baseX: x,
        baseY: y,
        phase: rng.float(0, Math.PI * 2),
        drift: rng.float(0.3, 0.9),
        speed: rng.float(0.15, 0.3),
      });
    }

    this.confetti = new Confetti(150, this.seed ^ 0xc0ffee, {
      minX: -24,
      maxX: 24,
      minY: -2,
      maxY: 18,
      minZ: -44,
      maxZ: 18,
    });
    this.group.add(this.confetti.mesh);
  }

  get seedValue(): number {
    return this.seed;
  }

  /** Reset authored motion so every run starts from the same deck phase. */
  resetKinematics(): void {
    this.elapsed = 0;
    const { moving } = this;
    const x = moving.baseX + Math.sin(moving.phase) * moving.amplitude;
    moving.collider.position.set(x, -0.5, moving.baseZ);
    moving.collider.prevPosition.copy(moving.collider.position);
    moving.collider.velocity.set(0, 0, 0);
    moving.visual.position.x = x;
    this.beltTexture.offset.y = 0;
  }

  /** Physics-rate kinematic update. Called before world.step(). */
  step(dt: number, bodies: readonly BeanBody[]): void {
    this.elapsed += dt;
    const body = bodies[0];
    if (body) this.bodyProgress = this.progress(body.position);
    const { moving } = this;
    const x =
      moving.baseX + Math.sin(this.elapsed * moving.speed + moving.phase) * moving.amplitude;
    moveCollider(moving.collider, x, -0.5, moving.baseZ, dt);
    moving.visual.position.x = x;
  }

  /** Render-rate dressing animation. */
  animate(elapsed: number, dt: number): void {
    this.beltTexture.offset.y = (elapsed * 0.85) % 1;

    for (const cloud of this.cloudDrifters) {
      cloud.group.position.x = cloud.baseX + Math.sin(elapsed * cloud.speed + cloud.phase) * cloud.drift;
      cloud.group.position.y = cloud.baseY + Math.sin(elapsed * 0.18 + cloud.phase) * 0.22;
    }
    for (const balloon of this.balloons) {
      balloon.group.position.x = balloon.baseX + Math.sin(elapsed * 0.26 + balloon.phase) * balloon.drift;
      balloon.group.position.y = balloon.baseY + Math.sin(elapsed * 0.44 + balloon.phase) * 0.35;
      balloon.group.rotation.z = Math.sin(elapsed * 0.3 + balloon.phase) * 0.045;
    }

    const pulse = 1 + Math.sin(elapsed * 3.2) * 0.035;
    this.padVisual.scale.set(pulse, 1, pulse);

    for (const marker of this.checkpointMarkers) {
      marker.group.position.y = 0.02 + Math.max(0, Math.sin(elapsed * 2 + marker.phase)) * 0.06;
      marker.group.rotation.y += dt * 0.6;
    }

    this.finishSign.rotation.z = Math.sin(elapsed * 1.4) * 0.012;
    this.confetti.update(dt, elapsed);
  }

  checkpointFor(position: Vector3, current: number): number {
    for (let i = this.checkpoints.length - 1; i > current; i -= 1) {
      const checkpoint = this.checkpoints[i];
      if (!checkpoint) continue;
      if (
        position.z >= (checkpoint.minZ ?? -Infinity) &&
        position.z <= (checkpoint.maxZ ?? Infinity) &&
        position.y <= (checkpoint.maxY ?? Infinity)
      ) {
        return i;
      }
    }
    return current;
  }

  isAtFinish(position: Vector3): boolean {
    return (
      position.y > 2.7 &&
      position.z < -33.0 &&
      position.z > -38.5 &&
      Math.abs(position.x) < 4.35
    );
  }

  progress(position: Vector3): number {
    return clamp((this.startPosition.z - position.z) / (this.startPosition.z - this.finishPosition.z), 0, 1);
  }

  status(): LevelStatus {
    const percent = Math.round(this.bodyProgress * 100);
    return {
      mode: this.mode,
      title: this.title,
      objective: this.objective,
      elapsed: this.elapsed,
      timeLimit: 0,
      progress: this.bodyProgress,
      progressLabel: `${percent}%`,
      metricLabel: 'PROGRESS',
      metricValue: `${percent}%`,
      phase: 'PRACTICE',
      result: null,
    };
  }

  finishNow(): LevelResult {
    return {
      kind: 'finish',
      title: 'DECK CLEARED!',
      detail: 'That is the Training Deck. The full show is still warming up.',
      time: this.elapsed,
      winner: null,
    };
  }

  setQuality(quality: Quality): void {
    const high = quality === 'high';
    this.directional.castShadow = high;
    this.confetti.setDensity(high);
  }

  dispose(): void {
    disposeObject(this.group, this.ownedTextures);
    this.confetti.dispose();
  }

  private addPlatform(
    x: number,
    z: number,
    width: number,
    depth: number,
    topColor: string | number,
    sideColor: string | number,
    trimColor: string | number,
    topTexture: Texture | null = null,
    y = 0,
  ): Group {
    const platform = makePlatform(width, depth, topColor, sideColor, trimColor, topTexture);
    platform.position.set(x, y, z);
    this.group.add(platform);
    return platform;
  }

  private addBox(
    x: number,
    y: number,
    z: number,
    hx: number,
    hy: number,
    hz: number,
    kind: Collider['kind'] = 'solid',
    velocity?: Vector3,
  ): Collider {
    const collider = createBoxCollider({
      kind,
      position: new Vector3(x, y, z),
      halfExtents: new Vector3(hx, hy, hz),
      velocity,
    });
    this.colliders.push(collider);
    return collider;
  }

  private addCylinder(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    kind: Collider['kind'],
    bounceStrength = 0,
  ): Collider {
    const collider = createCylinderCollider({
      kind,
      position: new Vector3(x, y, z),
      radius,
      height,
      bounceStrength,
    });
    this.colliders.push(collider);
    return collider;
  }

  private buildWall(): void {
    const wallMaterial = makeToonMaterial({ color: 0xff6b6b });
    const wall = new Mesh(new RoundedBoxGeometry(3.2, 1.6, 0.52, 2, 0.12), wallMaterial);
    wall.position.set(2.4, 0.8, -2.8);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.group.add(wall);
    this.addBox(2.4, 0.8, -2.8, 1.5, 0.8, 0.26, 'solid');

    // Cream stripes make the wall legible against the runway.
    const stripeMaterial = makeToonMaterial({ color: 0xfff6e5 });
    for (let i = -1; i <= 1; i += 1) {
      const stripe = new Mesh(new RoundedBoxGeometry(0.5, 1.44, 0.56, 2, 0.06), stripeMaterial);
      stripe.position.set(2.4 + i * 0.88, 0.8, -2.8);
      stripe.castShadow = false;
      this.group.add(stripe);
    }

    const sign = makeSign('GO AROUND!', 'the wall is not a door', 2.6, 1.15, this.ownedTextures);
    sign.position.set(2.4, 2.25, -2.5);
    this.group.add(sign);
  }

  private buildBouncePad(): void {
    this.padVisual.position.set(0, 0, -27.5);
    this.group.add(this.padVisual);

    const base = new Mesh(
      new CylinderGeometry(1.38, 1.5, 0.16, 24),
      makeToonMaterial({ color: 0xff6b6b }),
    );
    base.position.y = 0.08;
    base.castShadow = true;
    base.receiveShadow = true;
    this.padVisual.add(base);

    const cushion = new Mesh(
      new CylinderGeometry(1.18, 1.22, 0.16, 24),
      makeToonMaterial({ color: 0xffc145 }),
    );
    cushion.position.y = 0.23;
    cushion.castShadow = true;
    this.padVisual.add(cushion);

    const ring = new Mesh(
      new TorusGeometry(1.05, 0.055, 8, 28),
      makeToonMaterial({ color: 0xfff6e5 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.315;
    this.padVisual.add(ring);

    const star = new Mesh(
      new SphereGeometry(0.22, 8, 6),
      makeToonMaterial({ color: 0xfff6e5, emissive: 0xffc145, emissiveIntensity: 0.2 }),
    );
    star.scale.set(1.4, 0.3, 1.4);
    star.position.y = 0.32;
    this.padVisual.add(star);
  }

  private buildConveyorRails(): void {
    const railMaterial = makeToonMaterial({ color: 0xfff6e5 });
    for (const side of [-1, 1]) {
      const rail = new Mesh(new RoundedBoxGeometry(0.22, 0.34, 10, 2, 0.07), railMaterial);
      rail.position.set(side * 3.95, 0.17, -19);
      rail.castShadow = true;
      this.group.add(rail);
    }
  }

  private addRail(parent: Group, halfWidth: number, halfDepth: number, color: number): void {
    const material = makeToonMaterial({ color });
    for (const side of [-1, 1]) {
      const rail = new Mesh(new RoundedBoxGeometry(0.16, 0.22, halfDepth * 2, 2, 0.05), material);
      rail.position.set(side * halfWidth, -0.08, 0);
      rail.castShadow = true;
      parent.add(rail);
    }
  }

  private buildFinishGate(): void {
    const postMaterial = makeToonMaterial({ color: 0xffc145 });
    for (const side of [-1, 1]) {
      const post = new Mesh(new CylinderGeometry(0.14, 0.18, 2.5, 10), postMaterial);
      post.position.set(side * 3.2, 4.25, -35.4);
      post.castShadow = true;
      this.group.add(post);
    }

    this.finishSign.position.set(0, 5.65, -35.2);
    this.group.add(this.finishSign);
    const sign = makeSign('FINISH!', 'training deck cleared', 4.2, 1.7, this.ownedTextures);
    this.finishSign.add(sign);

    const crown = new Group();
    crown.position.set(0, 6.75, -35.2);
    const gold = makeToonMaterial({ color: 0xffc145 });
    const band = new Mesh(new CylinderGeometry(0.34, 0.38, 0.18, 6), gold);
    crown.add(band);
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      const spike = new Mesh(new ConeGeometry(0.09, 0.3, 5), gold);
      spike.position.set(Math.cos(angle) * 0.26, 0.2, Math.sin(angle) * 0.26);
      crown.add(spike);
    }
    this.group.add(crown);

    const flag = new Mesh(
      new ConeGeometry(0.22, 0.8, 4),
      makeToonMaterial({ color: 0x59d9b0 }),
    );
    flag.rotation.z = Math.PI;
    flag.position.set(0, 7.55, -35.2);
    this.group.add(flag);
  }

  private buildBunting(
    x: number,
    z: number,
    width: number,
    poleHeight: number,
    baseY: number,
  ): void {
    for (const side of [-1, 1]) {
      const pole = makePole(poleHeight);
      pole.position.set(x + side * (width / 2), baseY, z);
      this.group.add(pole);
      const knob = new Mesh(new SphereGeometry(0.14, 10, 8), makeToonMaterial({ color: 0xffc145 }));
      knob.position.set(x + side * (width / 2), baseY + poleHeight + 0.06, z);
      this.group.add(knob);
    }
    const bunting = makeBuntingLine(width, 12, new Rng(this.seed ^ Math.floor((z + 60) * 97)));
    bunting.position.set(x, baseY + poleHeight - 0.02, z);
    this.group.add(bunting);
  }

  private buildStartDecals(): void {
    const lineTexture = makeCheckerTexture('#ff6b6b', '#fff6e5', 5, 1);
    const lineMaterial = makeToonMaterial({ color: 0xffffff, map: lineTexture });
    const line = new Mesh(new RoundedBoxGeometry(8.5, 0.035, 0.62, 2, 0.02), lineMaterial);
    line.position.set(0, 0.02, 6.9);
    line.receiveShadow = true;
    this.group.add(line);

    const arrowTexture = makeArrowTexture();
    const arrowMaterial = new MeshBasicMaterial({
      map: arrowTexture,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    const arrowSpots: ReadonlyArray<readonly [number, number, number]> = [
      [0, 8.15, 2.7],
      [0, 1.4, 2.1],
      [0, -1.0, 1.7],
      [0, -27.3, 1.5],
    ];
    for (const [x, z, size] of arrowSpots) {
      const arrow = new Mesh(new PlaneGeometry(size, size), arrowMaterial);
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.set(x, 0.016, z);
      arrow.renderOrder = 2;
      this.group.add(arrow);
    }
  }

  private addCheckpointMarker(x: number, y: number, z: number, color: number, index: number): void {
    const group = new Group();
    group.position.set(x, y, z);
    const ring = new Mesh(
      new TorusGeometry(0.55, 0.06, 8, 22),
      makeToonMaterial({ color, emissive: color, emissiveIntensity: 0.28 }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    const dot = new Mesh(new SphereGeometry(0.08, 8, 6), makeToonMaterial({ color: 0xfff6e5 }));
    dot.position.y = 0.12;
    group.add(dot);
    this.group.add(group);
    this.checkpointMarkers.push({ group, phase: index * 1.7 });
  }
}
