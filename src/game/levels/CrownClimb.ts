import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  Object3D,
  Quaternion,
  SphereGeometry,
  Texture,
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
  setColliderTransform,
  type Collider,
} from '../physics/Collider';
import { makeToonMaterial } from '../util/toon';
import { clamp } from '../util/math';
import {
  disposeObject,
  makeBalloon,
  makeBuntingLine,
  makeCloud,
  makeCrowd,
  makeIsland,
  makeSign,
  makeSky,
} from './common';
import type {
  Checkpoint,
  Level,
  LevelMode,
  LevelResult,
  LevelStatus,
  Quality,
  Waypoint,
} from './Level';

interface Beam {
  collider: Collider;
  visual: Group;
  y: number;
  speed: number;
  phase: number;
}

interface Donut {
  collider: Collider;
  visual: Group;
  base: Vector3;
  amplitude: number;
  speed: number;
  phase: number;
}

interface Pendulum {
  collider: Collider;
  arm: Group;
  pivot: Vector3;
  length: number;
  speed: number;
  phase: number;
  amplitude: number;
}

interface Drifter {
  group: Group;
  baseX: number;
  baseY: number;
  phase: number;
  drift: number;
  speed: number;
}

const START_Y = 0;
const CROWN_Y = 50.1;
const DAIS_TOP = 48.4;
const SPIRAL_RADIUS = 9;
const STEP_COUNT = 40;
const STEP_RISE = 1.1;
const FIRST_STEP_Y = 1.1;
const SLIME_START = -2;
const SLIME_BASE_SPEED = 0.35;
const SLIME_FAST_SPEED = 0.8;
const ROUND_LIMIT = 120;
const STEP_YAW_DELTA = 0.52;
const UP_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);

/**
 * Crown Climb — the vertical final Round.
 *
 * A 48 u spiral ascent: rotating beam carousel, bobbing donut platforms,
 * pendulum alley and the crown dais. Candy slime rises from below and is
 * lethal; the first Tumbler to touch the giant crown wins. On timeout the
 * highest body is the winner.
 */
export class CrownClimb implements Level {
  readonly mode: LevelMode = 'crown-climb';
  readonly title = 'CROWN CLIMB';
  readonly objective = 'Touch the crown before the slime';
  readonly group = new Group();
  readonly colliders: Collider[] = [];
  readonly startPosition = new Vector3(6.15, 0.02, 3.55);
  readonly finishPosition = new Vector3(0, CROWN_Y, 0);
  readonly respawnAllowed = false;
  readonly checkpoints: readonly Checkpoint[] = [
    { position: new Vector3(6.15, 0.02, 3.55) },
  ];
  readonly waypoints: readonly Waypoint[];

  private readonly seed: number;
  private readonly ownedTextures = new Set<Texture>();
  private readonly beams: Beam[] = [];
  private readonly donuts: Donut[] = [];
  private readonly pendulums: Pendulum[] = [];
  private readonly clouds: Drifter[] = [];
  private readonly balloons: Drifter[] = [];
  private readonly crowd: Drifter[] = [];
  private readonly directional: DirectionalLight;
  private readonly crown = new Group();
  private readonly crownCenter = new Vector3(0, CROWN_Y, 0);
  private readonly slime = new Group();
  private readonly slimeMesh: Mesh;
  private elapsed = 0;
  private slimeY = SLIME_START;
  private result: LevelResult | null = null;
  private winnerName: string | null = null;
  private bodyProgress = 0;
  private readonly scratchQuaternion = new Quaternion();
  private readonly scratchBob = new Vector3();

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const rng = new Rng((this.seed ^ 0xc20a9) >>> 0);
    this.group.add(makeSky());
    this.group.add(new HemisphereLight(0xffe8dc, 0x8fd6ff, 0.6));

    this.directional = new DirectionalLight(0xfff0d4, 1.32);
    this.directional.position.set(26, 58, 24);
    this.directional.castShadow = true;
    this.directional.shadow.mapSize.set(1024, 1024);
    this.directional.shadow.camera.left = -24;
    this.directional.shadow.camera.right = 24;
    this.directional.shadow.camera.top = 80;
    this.directional.shadow.camera.bottom = -24;
    this.directional.shadow.camera.near = 1;
    this.directional.shadow.camera.far = 140;
    this.directional.shadow.bias = -0.0004;
    this.directional.shadow.normalBias = 0.035;
    this.directional.target.position.set(0, 24, 0);
    this.group.add(this.directional);
    this.group.add(this.directional.target);

    this.buildTower(rng);
    this.buildSlime(rng);
    this.buildCrown();
    this.buildScenery(rng);

    this.slimeMesh = this.slime.children[0] as Mesh;
    this.waypoints = this.buildWaypoints();
  }

  // ------------------------------------------------------------------ Build

  private buildTower(rng: Rng): void {
    // Start deck.
    const start = new Mesh(
      new CylinderGeometry(7.4, 7.8, 1.2, 28),
      makeToonMaterial({ color: 0xfff6e5 }),
    );
    start.position.y = -0.6;
    start.castShadow = true;
    start.receiveShadow = true;
    this.group.add(start);
    const startTrim = new Mesh(
      new TorusGeometry(7.3, 0.2, 8, 40),
      makeToonMaterial({ color: 0xff6b6b }),
    );
    startTrim.rotation.x = Math.PI / 2;
    startTrim.position.y = 0.02;
    this.group.add(startTrim);
    this.colliders.push(
      createCylinderCollider({
        kind: 'solid',
        position: new Vector3(0, -0.6, 0),
        radius: 7.4,
        height: 1.2,
      }),
    );

    this.buildSpiral(rng);
    this.buildCarousel();
    this.buildPendulums();
    this.buildDais();
  }

  private buildSpiral(rng: Rng): void {
    const geometry = new RoundedBoxGeometry(4.5, 0.8, 3.1, 3, 0.16);
    const material = makeToonMaterial({ color: 0xffffff });
    const stepPositions: Array<{ position: Vector3; yaw: number; color: Color }> = [];
    const stageColors = [0xff6b6b, 0xffc145, 0x59d9b0, 0x57c7ff];

    for (let i = 0; i < STEP_COUNT; i += 1) {
      const angle = -Math.PI / 2 + i * STEP_YAW_DELTA;
      const y = FIRST_STEP_Y + i * STEP_RISE;
      const x = Math.cos(angle) * SPIRAL_RADIUS;
      const z = Math.sin(angle) * SPIRAL_RADIUS;
      const yaw = -angle - Math.PI / 2;
      const isDonut = i >= 12 && i <= 21;

      if (isDonut) {
        this.addDonut(x, y, z, i, rng);
        continue;
      }

      const stage = y < 12 ? 0 : y < 25 ? 2 : y < 39 ? 3 : 1;
      stepPositions.push({
        position: new Vector3(x, y, z),
        yaw,
        color: new Color(stageColors[stage]!).offsetHSL(0, 0, (i % 3) * 0.02),
      });
      const quaternion = new Quaternion().setFromEuler(new Euler(0, yaw, 0));
      this.colliders.push(
        createBoxCollider({
          kind: 'solid',
          position: new Vector3(x, y - 0.4, z),
          halfExtents: new Vector3(2.25, 0.4, 1.55),
          quaternion,
        }),
      );
    }

    // Three final pads step inward to the dais.
    const finalPads: ReadonlyArray<readonly [number, number, number]> = [
      [8, 45.1, 0.18],
      [6.2, 46.2, 0.22],
      [4.6, 47.3, 0.28],
    ];
    for (const [radius, y, scale] of finalPads) {
      const angle = -Math.PI / 2 + STEP_COUNT * STEP_YAW_DELTA;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const pad = new Mesh(
        new CylinderGeometry(2.5 * scale * 4, 2.6 * scale * 4, 0.7, 20),
        makeToonMaterial({ color: iColor(y) }),
      );
      pad.position.set(x, y - 0.35, z);
      pad.castShadow = true;
      pad.receiveShadow = true;
      this.group.add(pad);
      this.colliders.push(
        createCylinderCollider({
          kind: 'solid',
          position: new Vector3(x, y - 0.35, z),
          radius: 2.5 * scale * 4,
          height: 0.7,
        }),
      );
    }

    const mesh = new InstancedMesh(geometry, material, stepPositions.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const dummy = new Object3D();
    for (let i = 0; i < stepPositions.length; i += 1) {
      const entry = stepPositions[i]!;
      dummy.position.set(entry.position.x, entry.position.y - 0.4, entry.position.z);
      dummy.rotation.set(0, entry.yaw, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, entry.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
  }

  private addDonut(x: number, y: number, z: number, index: number, rng: Rng): void {
    const visual = new Group();
    visual.position.set(x, y - 0.25, z);
    const disc = new Mesh(
      new CylinderGeometry(2.15, 2.15, 0.5, 22),
      makeToonMaterial({ color: 0xfff0d2 }),
    );
    disc.castShadow = true;
    disc.receiveShadow = true;
    visual.add(disc);
    const frosting = new Mesh(
      new TorusGeometry(1.65, 0.42, 10, 30),
      makeToonMaterial({ color: 0xff9ecb, emissive: 0xff6b6b, emissiveIntensity: 0.08 }),
    );
    frosting.rotation.x = Math.PI / 2;
    frosting.position.y = 0.22;
    visual.add(frosting);
    const sprinkle = new Mesh(
      new SphereGeometry(0.12, 8, 6),
      makeToonMaterial({ color: 0x57c7ff }),
    );
    sprinkle.position.set(0.6, 0.55, 0.3);
    visual.add(sprinkle);
    this.group.add(visual);

    const collider = createCylinderCollider({
      kind: 'solid',
      position: new Vector3(x, y - 0.25, z),
      radius: 2.15,
      height: 0.5,
    });
    this.colliders.push(collider);
    this.donuts.push({
      collider,
      visual,
      base: new Vector3(x, y - 0.25, z),
      amplitude: rng.float(0.32, 0.48),
      speed: rng.float(0.4, 0.55),
      phase: index * 0.77,
    });
  }

  private buildCarousel(): void {
    const column = new Mesh(
      new CylinderGeometry(0.95, 1.25, DAIS_TOP + 1, 12),
      makeToonMaterial({ color: 0xfff6e5 }),
    );
    column.position.y = (DAIS_TOP + 1) / 2;
    column.castShadow = true;
    column.receiveShadow = true;
    this.group.add(column);
    // The column is solid to the camera and the player, so the follow camera
    // cannot clip through it during the crown orbit.
    this.colliders.push(
      createCylinderCollider({
        kind: 'solid',
        position: new Vector3(0, (DAIS_TOP + 1) / 2, 0),
        radius: 1.15,
        height: DAIS_TOP + 1,
      }),
    );
    // Candy stripes climb the column so the ascent reads at distance.
    for (let y = 2; y < DAIS_TOP; y += 3.6) {
      const stripe = new Mesh(
        new TorusGeometry(1.02 + (1 - (y / DAIS_TOP)) * 0.2, 0.12, 6, 18),
        makeToonMaterial({ color: y % 7 < 4 ? 0xff6b6b : 0xffc145 }),
      );
      stripe.rotation.x = Math.PI / 2;
      stripe.position.y = y;
      this.group.add(stripe);
    }

    for (const [y, speed, phase] of [
      [3.4, 0.52, 0.2],
      [7.6, -0.72, 1.9],
    ] as const) {
      const visual = new Group();
      visual.position.set(0, y, 0);
      const beam = new Mesh(
        new RoundedBoxGeometry(22.6, 0.55, 0.85, 3, 0.16),
        makeToonMaterial({ color: 0xff6b6b, emissive: 0xff6b6b, emissiveIntensity: 0.12 }),
      );
      beam.castShadow = true;
      visual.add(beam);
      const stripe = new Mesh(
        new RoundedBoxGeometry(22.2, 0.1, 0.92, 2, 0.03),
        makeToonMaterial({ color: 0xfff6e5 }),
      );
      stripe.position.y = 0.03;
      visual.add(stripe);
      const hub = new Mesh(
        new CylinderGeometry(0.62, 0.72, 1.2, 12),
        makeToonMaterial({ color: 0xffc145 }),
      );
      visual.add(hub);
      this.group.add(visual);
      const collider = createBoxCollider({
        kind: 'hazard',
        position: new Vector3(0, y, 0),
        halfExtents: new Vector3(11.3, 0.28, 0.45),
        angularVelocity: new Vector3(0, speed, 0),
      });
      this.colliders.push(collider);
      this.beams.push({ collider, visual, y, speed, phase });
    }
  }

  private buildPendulums(): void {
    for (let i = 0; i < 3; i += 1) {
      const y = 28 + i * 5;
      const pivot = new Vector3(0, y + 7, 0);
      const length = 10.2;
      const arm = new Group();
      arm.position.copy(pivot);
      const rod = new Mesh(
        new CylinderGeometry(0.11, 0.15, length, 8),
        makeToonMaterial({ color: 0xfff6e5 }),
      );
      rod.position.y = -length / 2;
      arm.add(rod);
      const bob = new Mesh(
        new RoundedBoxGeometry(2, 1.5, 2, 3, 0.4),
        makeToonMaterial({ color: 0xa78bfa, emissive: 0xff6b6b, emissiveIntensity: 0.12 }),
      );
      bob.position.y = -length;
      bob.castShadow = true;
      arm.add(bob);
      this.group.add(arm);
      const collider = createBoxCollider({
        kind: 'hazard',
        position: new Vector3(0, pivot.y - length, 0),
        halfExtents: new Vector3(1.1, 0.85, 1.1),
      });
      this.colliders.push(collider);
      this.pendulums.push({
        collider,
        arm,
        pivot,
        length,
        speed: 0.9 + i * 0.12,
        phase: i * 2.1,
        amplitude: 0.62,
      });
    }
  }

  private buildDais(): void {
    const dais = new Mesh(
      new CylinderGeometry(4.7, 5.2, 1.7, 28),
      makeToonMaterial({ color: 0xffc145 }),
    );
    dais.position.y = DAIS_TOP - 0.85;
    dais.castShadow = true;
    dais.receiveShadow = true;
    this.group.add(dais);
    const trim = new Mesh(
      new TorusGeometry(4.62, 0.23, 8, 36),
      makeToonMaterial({ color: 0xff6b6b }),
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = DAIS_TOP - 0.02;
    this.group.add(trim);
    this.colliders.push(
      createCylinderCollider({
        kind: 'solid',
        position: new Vector3(0, DAIS_TOP - 0.85, 0),
        radius: 4.7,
        height: 1.7,
      }),
    );

    const banner = makeSign('CROWN CLIMB', 'up is the only way', 4.8, 1.6, this.ownedTextures);
    banner.position.set(0, 8.5, 10.5);
    this.group.add(banner);
  }

  private buildCrown(): void {
    this.crown.position.copy(this.crownCenter);
    const gold = makeToonMaterial({
      color: 0xffc145,
      emissive: 0xffc145,
      emissiveIntensity: 0.22,
    });
    const band = new Mesh(new CylinderGeometry(2.25, 2.45, 1.15, 12), gold);
    band.castShadow = true;
    this.crown.add(band);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const spike = new Mesh(new CylinderGeometry(0.08, 0.36, 2.1, 5), gold);
      spike.position.set(Math.cos(angle) * 1.85, 1.35, Math.sin(angle) * 1.85);
      this.crown.add(spike);
      const jewel = new Mesh(
        new SphereGeometry(0.22, 10, 8),
        makeToonMaterial({ color: i % 2 === 0 ? 0xff6b6b : 0x57c7ff }),
      );
      jewel.position.set(Math.cos(angle) * 2.35, 0.02, Math.sin(angle) * 2.35);
      this.crown.add(jewel);
    }
    this.group.add(this.crown);
  }

  private buildSlime(rng: Rng): void {
    const surface = new Mesh(
      new CircleGeometry(36, 52),
      makeToonMaterial({ color: 0xff4fa3, emissive: 0xff4fa3, emissiveIntensity: 0.15 }),
    );
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = SLIME_START;
    surface.receiveShadow = true;
    this.slime.add(surface);
    const ring = new Mesh(
      new TorusGeometry(35, 0.7, 8, 64),
      makeToonMaterial({ color: 0xff9ecb }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.35;
    this.slime.add(ring);
    for (let i = 0; i < 16; i += 1) {
      const bubble = new Mesh(
        new SphereGeometry(rng.float(0.25, 0.75), 10, 8),
        makeToonMaterial({ color: 0xffc2dd, emissive: 0xff4fa3, emissiveIntensity: 0.2 }),
      );
      const angle = rng.float(0, Math.PI * 2);
      const radius = rng.float(4, 24);
      bubble.position.set(Math.cos(angle) * radius, rng.float(0.4, 0.9), Math.sin(angle) * radius);
      this.slime.add(bubble);
    }
    this.group.add(this.slime);
  }

  private buildScenery(rng: Rng): void {
    const islands: ReadonlyArray<readonly [number, number, number, number]> = [
      [-24, 1, 16, 6],
      [25, 4, 13, 7],
      [-28, 12, -10, 5.5],
      [28, 18, -8, 6],
      [-24, 27, 6, 5],
      [25, 34, 10, 6],
      [-27, 42, -4, 5.5],
      [29, 47, 2, 7],
    ];
    for (const [x, y, z, radius] of islands) {
      const island = makeIsland(radius, rng);
      island.position.set(x, y, z);
      this.group.add(island);
    }

    for (let layer = 0; layer < 6; layer += 1) {
      for (let i = 0; i < 4; i += 1) {
        const cloud = makeCloud(rng.float(1.5, 3.2), rng);
        const angle = rng.float(0, Math.PI * 2);
        const radius = rng.float(18, 42);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = layer * 8 + rng.float(1, 5);
        cloud.position.set(x, y, z);
        this.group.add(cloud);
        this.clouds.push({
          group: cloud,
          baseX: x,
          baseY: y,
          phase: rng.float(0, Math.PI * 2),
          drift: rng.float(0.5, 2),
          speed: rng.float(0.03, 0.08),
        });
      }
    }

    const colors = [0xff6b6b, 0xffc145, 0x59d9b0, 0x57c7ff, 0xa78bfa, 0xff9ecb];
    for (let i = 0; i < 10; i += 1) {
      const balloon = makeBalloon(colors[i % colors.length]!);
      const angle = rng.float(0, Math.PI * 2);
      const radius = rng.float(14, 32);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = rng.float(6, 44);
      balloon.position.set(x, y, z);
      balloon.scale.setScalar(rng.float(0.7, 1.25));
      this.group.add(balloon);
      this.balloons.push({
        group: balloon,
        baseX: x,
        baseY: y,
        phase: rng.float(0, Math.PI * 2),
        drift: rng.float(0.4, 1.4),
        speed: rng.float(0.12, 0.28),
      });
    }

    // Cheering silhouettes at three altitudes on floating stands.
    const audienceSpots: ReadonlyArray<readonly [number, number, number, number]> = [
      [-17, 3, 9, 0.1],
      [17, 16, -6, -0.3],
      [-18, 31, 8, 0.2],
      [18, 43, -5, -0.2],
    ];
    for (let i = 0; i < audienceSpots.length; i += 1) {
      const [x, y, z, rotation] = audienceSpots[i]!;
      const audience = makeCrowd(10, 5.5, new Rng(this.seed ^ (0xc20d + i)), colors[i % colors.length]!);
      audience.position.set(x, y, z);
      audience.rotation.y = rotation;
      this.group.add(audience);
      this.crowd.push({
        group: audience,
        baseX: x,
        baseY: y,
        phase: i * 1.4,
        drift: 0,
        speed: 0.7,
      });
    }

    for (let i = 0; i < 5; i += 1) {
      const bunting = makeBuntingLine(16, 10, new Rng(this.seed ^ (0xb00b + i)));
      bunting.position.set(0, 8 + i * 8, 8.5 + (i % 2) * 1.5);
      this.group.add(bunting);
    }
  }

  private buildWaypoints(): Waypoint[] {
    const points: Waypoint[] = [
      { position: new Vector3(6.15, 0.02, 3.55), action: 'run', radius: 1.2 },
    ];
    for (let i = 0; i < STEP_COUNT; i += 1) {
      const angle = -Math.PI / 2 + i * STEP_YAW_DELTA;
      const y = FIRST_STEP_Y + i * STEP_RISE;
      const isDonut = i >= 12 && i <= 21;
      points.push({
        position: new Vector3(Math.cos(angle) * SPIRAL_RADIUS, y, Math.sin(angle) * SPIRAL_RADIUS),
        action: isDonut ? 'ride' : i === 0 ? 'jump' : 'run',
        radius: isDonut ? 1.8 : 1.3,
      });
    }
    const finalAngle = -Math.PI / 2 + STEP_COUNT * STEP_YAW_DELTA;
    for (const [radius, y] of [
      [8, 45.2],
      [6.2, 46.3],
      [4.6, 47.4],
    ] as const) {
      points.push({
        position: new Vector3(Math.cos(finalAngle) * radius, y, Math.sin(finalAngle) * radius),
        action: 'jump',
        radius: 1.4,
      });
    }
    points.push({ position: new Vector3(0, DAIS_TOP + 0.05, 0), action: 'run', radius: 1.5 });
    points.push({ position: new Vector3(0, CROWN_Y, 0), action: 'run', radius: 2 });
    return points;
  }

  // ------------------------------------------------------------------ Contract

  step(dt: number, bodies: readonly BeanBody[]): void {
    this.elapsed += dt;
    const speed = this.elapsed >= 60 ? SLIME_FAST_SPEED : SLIME_BASE_SPEED;
    this.slimeY += speed * dt;
    this.slime.position.y = this.slimeY;

    for (const beam of this.beams) {
      const angle = beam.phase + this.elapsed * beam.speed;
      beam.visual.rotation.y = angle;
      this.scratchQuaternion.setFromAxisAngle(UP_AXIS, angle);
      setColliderTransform(
        beam.collider,
        beam.collider.position,
        this.scratchQuaternion,
        dt,
      );
      beam.collider.angularVelocity.set(0, beam.speed, 0);
    }

    for (const donut of this.donuts) {
      const y = donut.base.y + Math.sin(this.elapsed * donut.speed + donut.phase) * donut.amplitude;
      moveCollider(
        donut.collider,
        donut.collider.position.x,
        y,
        donut.collider.position.z,
        dt,
      );
      donut.visual.position.y = y;
    }

    for (const pendulum of this.pendulums) {
      const swing = Math.sin(this.elapsed * pendulum.speed + pendulum.phase) * pendulum.amplitude;
      pendulum.arm.rotation.z = swing;
      this.scratchBob.set(
        pendulum.pivot.x + Math.sin(swing) * pendulum.length,
        pendulum.pivot.y - Math.cos(swing) * pendulum.length,
        pendulum.pivot.z,
      );
      this.scratchQuaternion.setFromAxisAngle(Z_AXIS, swing);
      setColliderTransform(pendulum.collider, this.scratchBob, this.scratchQuaternion, dt);
    }

    const body = bodies[0];
    if (body) {
      this.bodyProgress = this.progress(body.position);
      if (body.position.y <= this.slimeY + 0.25 && !body.eliminated) {
        body.eliminated = true;
      }
      if (!this.result && this.isAtFinish(body.position)) {
        this.winnerName = 'YOU';
        this.result = {
          kind: 'crown',
          title: 'CROWNED!',
          detail: 'You touched the crown before the slime caught up. Show-off.',
          time: this.elapsed,
          winner: 'YOU',
        };
      }
    }

    if (!this.result && this.elapsed >= ROUND_LIMIT) {
      let highest: BeanBody | null = null;
      for (const candidate of bodies) {
        if (candidate.eliminated) continue;
        if (!highest || candidate.position.y > highest.position.y) highest = candidate;
      }
      const winner = highest === body ? 'YOU' : highest ? 'A rival Tumbler' : null;
      this.winnerName = winner;
      this.result = {
        kind: 'timeout',
        title: 'TIME!',
        detail: winner
          ? `${winner} was highest when the clock ran out.`
          : 'Nobody survived the slime.',
        time: this.elapsed,
        winner,
      };
    }

  }

  animate(elapsed: number, dt: number): void {
    this.crown.rotation.y = elapsed * 0.35;
    this.crown.position.y = CROWN_Y + Math.sin(elapsed * 0.9) * 0.18;
    this.slimeMesh.scale.set(1 + Math.sin(elapsed * 0.7) * 0.01, 1, 1 + Math.sin(elapsed * 0.7) * 0.01);
    for (const cloud of this.clouds) {
      cloud.group.position.x =
        cloud.baseX + Math.sin(elapsed * cloud.speed + cloud.phase) * cloud.drift;
      cloud.group.position.y = cloud.baseY + Math.sin(elapsed * 0.15 + cloud.phase) * 0.3;
    }
    for (const balloon of this.balloons) {
      balloon.group.position.x =
        balloon.baseX + Math.sin(elapsed * 0.2 + balloon.phase) * balloon.drift;
      balloon.group.position.y =
        balloon.baseY + Math.sin(elapsed * 0.32 + balloon.phase) * 0.5;
    }
    for (const crowd of this.crowd) {
      crowd.group.position.y =
        crowd.baseY + Math.abs(Math.sin(elapsed * 2.2 + crowd.phase)) * 0.18;
    }
    void dt;
  }

  resetKinematics(): void {
    this.elapsed = 0;
    this.slimeY = SLIME_START;
    this.slime.position.y = SLIME_START;
    this.result = null;
    this.winnerName = null;
    this.bodyProgress = 0;
    for (const beam of this.beams) {
      const angle = beam.phase;
      beam.visual.rotation.y = angle;
      beam.collider.quaternion.setFromAxisAngle(UP_AXIS, angle);
      beam.collider.prevQuaternion.copy(beam.collider.quaternion);
      beam.collider.velocity.set(0, 0, 0);
      beam.collider.angularVelocity.set(0, beam.speed, 0);
    }
    for (const donut of this.donuts) {
      const y = donut.base.y + Math.sin(donut.phase) * donut.amplitude;
      donut.collider.position.set(donut.base.x, y, donut.base.z);
      donut.collider.prevPosition.copy(donut.collider.position);
      donut.collider.velocity.set(0, 0, 0);
      donut.visual.position.y = y;
    }
    for (const pendulum of this.pendulums) {
      pendulum.collider.position.set(
        pendulum.pivot.x,
        pendulum.pivot.y - pendulum.length,
        pendulum.pivot.z,
      );
      pendulum.collider.prevPosition.copy(pendulum.collider.position);
      pendulum.collider.velocity.set(0, 0, 0);
      pendulum.arm.rotation.z = 0;
    }
  }

  checkpointFor(_position: Vector3, current: number): number {
    return current;
  }

  setQuality(quality: Quality): void {
    this.directional.castShadow = quality === 'high';
  }

  progress(position: Vector3): number {
    return clamp((position.y - START_Y) / (CROWN_Y - START_Y), 0, 1);
  }

  isAtFinish(position: Vector3): boolean {
    const dx = position.x - this.crownCenter.x;
    const dz = position.z - this.crownCenter.z;
    return position.y > DAIS_TOP - 0.4 && dx * dx + dz * dz < 3.2 * 3.2;
  }

  get killY(): number {
    return this.slimeY;
  }

  get cameraFloor(): number {
    return this.slimeY + 0.9;
  }

  get slimeHeight(): number {
    return this.slimeY;
  }

  get crownPosition(): Vector3 {
    return this.crownCenter;
  }

  get winner(): string | null {
    return this.winnerName;
  }

  status(): LevelStatus {
    const percent = Math.round(this.bodyProgress * 100);
    const phase =
      this.bodyProgress > 0.9
        ? 'CROWN DAIS'
        : this.elapsed >= 90
          ? 'SLIME AT FULL SPEED'
          : this.elapsed >= 60
            ? 'SLIME ACCELERATING'
            : 'ASCENT';
    return {
      mode: this.mode,
      title: this.title,
      objective: this.objective,
      elapsed: this.elapsed,
      timeLimit: ROUND_LIMIT,
      progress: this.bodyProgress,
      progressLabel: `${percent}%`,
      metricLabel: 'SLIME HEIGHT',
      metricValue: `${this.slimeY.toFixed(1)} u`,
      phase,
      result: this.result,
    };
  }

  finishNow(): LevelResult {
    if (!this.result) {
      this.result = {
        kind: 'crown',
        title: 'CROWNED!',
        detail: 'You touched the crown. The show has its winner.',
        time: this.elapsed,
        winner: 'YOU',
      };
      this.winnerName = 'YOU';
    }
    return this.result;
  }

  dispose(): void {
    disposeObject(this.group, this.ownedTextures);
  }
}

/** Small helper for the three final pad colours. */
function iColor(y: number): number {
  if (y > 47) return 0xffc145;
  if (y > 46) return 0xff6b6b;
  return 0x59d9b0;
}
