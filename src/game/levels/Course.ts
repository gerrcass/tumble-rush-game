import {
  CylinderGeometry,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
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
import { Confetti } from '../fx/Confetti';

import { clamp } from '../util/math';
import {
  createMaterialCache,
  disposeObject,
  makeArrowTexture,
  makeBalloon,
  makeBeltTexture,
  makeBuntingLine,
  makeCheckerTexture,
  makeCloud,
  makeCrowd,
  makeIsland,
  mergeColoredMeshes,
  makePlatform,
  makePole,
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
import { planCourse, type CoursePlan, type CourseSectionPlan } from './coursePlan';

interface Sweeper {
  collider: Collider;
  visual: Group;
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

interface Motion {
  collider: Collider;
  visual: Group;
  base: Vector3;
  axis: 'x' | 'y' | 'z';
  amplitude: number;
  speed: number;
  phase: number;
  /** Platform art sits 0.5 above its collider; pusher art matches it exactly. */
  visualOffsetY: number;
}

interface Drifter {
  group: Group;
  baseX: number;
  baseY: number;
  phase: number;
  drift: number;
  speed: number;
}

interface Rocker {
  group: Group;
  baseY: number;
  phase: number;
}

const CREAM = 0xfff6e5;
const UP_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);

/**
 * Sunrise Scramble — the linear Course Round.
 *
 * Five authored Sections float over a candy canyon and end at a raised Finish
 * Gate. The seed varies lane width, hazard phase, platform offsets, prop colors,
 * crowd arrangement and the optional Slime Slide shortcut; the grammar itself
 * is authored so a bot (and a player) can learn it.
 */
export class Course implements Level {
  readonly mode: LevelMode = 'course';
  readonly title = 'SUNRISE SCRAMBLE';
  readonly objective = 'Race through the finish gate';
  readonly group = new Group();
  readonly colliders: Collider[] = [];
  readonly startPosition = new Vector3(0, 0.02, 16);
  readonly finishPosition = new Vector3(0, 4.6, -156);
  readonly respawnAllowed = false;
  readonly killY = -14;
  readonly cameraFloor = 0.8;
  readonly plan: CoursePlan;
  readonly checkpoints: readonly Checkpoint[];
  readonly waypoints: readonly Waypoint[];

  private readonly seed: number;
  private readonly ownedTextures = new Set<Texture>();
  private readonly sweepers: Sweeper[] = [];
  private readonly pendulums: Pendulum[] = [];
  private readonly motions: Motion[] = [];
  private readonly crowd: Rocker[] = [];
  private readonly clouds: Drifter[] = [];
  private readonly balloons: Drifter[] = [];
  private readonly beltTexture = makeBeltTexture();
  private readonly confetti: Confetti;
  private readonly directional: DirectionalLight;
  private readonly materials = createMaterialCache();
  private readonly staticVisuals = new Group();
  private readonly padVisual = new Group();
  private readonly finishSign = new Group();
  private readonly scratchQuaternion = new Quaternion();
  private readonly scratchBob = new Vector3();
  private elapsed = 0;
  private bodyProgress = 0;
  private result: LevelResult | null = null;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.plan = planCourse(this.seed);
    const rng = new Rng((this.seed ^ 0x517e5) >>> 0);
    this.ownedTextures.add(this.beltTexture);
    this.beltTexture.repeat.set(2, 3);

    this.group.add(makeSky());
    this.group.add(new HemisphereLight(0xffe8d0, 0x7fd4ff, 0.5));

    this.directional = new DirectionalLight(0xfff2d6, 1.25);
    this.directional.position.set(42, 64, 30);
    this.directional.castShadow = true;
    this.directional.shadow.mapSize.set(1024, 1024);
    this.directional.shadow.camera.left = -55;
    this.directional.shadow.camera.right = 55;
    this.directional.shadow.camera.top = 110;
    this.directional.shadow.camera.bottom = -110;
    this.directional.shadow.camera.near = 1;
    this.directional.shadow.camera.far = 240;
    this.directional.shadow.bias = -0.0004;
    this.directional.shadow.normalBias = 0.03;
    this.directional.target.position.set(0, 0, -72);
    this.group.add(this.directional);
    this.group.add(this.directional.target);

    this.buildSectionA();
    this.buildSectionB();
    this.buildSectionC();
    this.buildSectionD();
    this.buildSectionE();
    this.buildScenery(rng);
    // Every non-animated Course prop shares a small per-Level material pool,
    // so collapsing by material turns ~200 scenery meshes into a handful of
    // draw calls. Animated pieces (hazards, clouds, balloons, crowd) stay out.
    mergeColoredMeshes(this.staticVisuals);
    this.group.add(this.staticVisuals);

    this.checkpoints = [
      { position: new Vector3(0, 0.04, 16), minZ: 12, maxZ: 22, maxY: 2 },
      { position: new Vector3(0, 0.04, -22), minZ: -25, maxZ: -19, maxY: 2 },
      { position: new Vector3(0, 0.04, -58), minZ: -61, maxZ: -55, maxY: 2 },
      { position: new Vector3(0, 0.04, -98), minZ: -101, maxZ: -95, maxY: 2 },
      { position: new Vector3(0, -1.55, -133), minZ: -136, maxZ: -130, maxY: 0.5 },
    ];
    this.waypoints = this.buildWaypoints();

    this.confetti = new Confetti(180, this.seed ^ 0x51a7, {
      minX: -32,
      maxX: 32,
      minY: -2,
      maxY: 26,
      minZ: -170,
      maxZ: 24,
    });
    this.group.add(this.confetti.mesh);
  }

  // ------------------------------------------------------------------ Sections

  private buildSectionA(): void {
    const plan = this.plan;
    const scale = plan.laneScale;
    const width = 12 * scale;

    this.addPlatform(0, 16, width, 9, CREAM, 0x59d9b0, 0xff6b6b);
    this.addBox(0, -0.5, 16, width / 2, 0.5, 4.5, 'solid');
    this.addStartLine(16, width);

    this.addPlatform(0, 4, 9.5 * scale, 14, CREAM, 0x57c7ff, 0xffc145);
    this.addBox(0, -0.5, 4, 4.75 * scale, 0.5, 7, 'solid');

    // Low hurdles: readable over-or-around choices, never traps.
    for (const [index, z] of [8.2].entries()) {
      const height = plan.hurdleHeight;
      const hurdleWidth = 6.2 * scale + index * 0.4;
      this.addHurdle(plan.platformOffset * 0.4, z, hurdleWidth, height);
    }

    this.addPlatform(0, -10, 8.6 * scale, 11, CREAM, 0xffc145, 0xff6b6b);
    this.addBox(0, -0.5, -10, 4.3 * scale, 0.5, 5.5, 'solid');
    this.addSweeper(
      plan.platformOffset * 0.8,
      0.06,
      -8.2,
      3.6 * scale,
      0.55,
      plan.sweeperSpeed * 0.58,
      plan.sections[0]!.hazardPhase,
    );
    this.addSign('BUNTING RUN', 'hop the hurdles · duck the sweeper', 0, 2.7, -8.2, 3.1, 1.1);
  }

  private buildSectionB(): void {
    const plan = this.plan;
    const scale = plan.laneScale;
    const phase = plan.sections[1]!.hazardPhase;

    // The A -> B gap is the signature leap. Keep it a real jump, but leave
    // enough landing lip that a full-speed take-off clears it (tuned against
    // the headless no-input race in courseRun.test.ts).
    this.addPlatform(0, -21, 8.4 * scale, 8, CREAM, 0x59d9b0, 0x57c7ff);
    this.addBox(0, -0.5, -21, 4.2 * scale, 0.5, 4, 'solid');

    this.addPlatform(0, -30.5, 10.2 * scale, 13, 0xfff0d2, 0x57c7ff, 0xffc145);
    this.addBox(0, -0.5, -30.5, 5.1 * scale, 0.5, 6.5, 'solid');
    this.addSweeper(
      plan.platformOffset,
      0.08,
      -27.6,
      4.4 * scale,
      0.5,
      plan.sweeperSpeed,
      phase,
    );
    this.addSweeper(
      -plan.platformOffset,
      0.08,
      -33.2,
      3.8 * scale,
      0.5,
      -plan.sweeperSpeed * 1.2,
      phase + 2.1,
    );

    this.addPlatform(0, -41.5, 10 * scale, 10, 0xfff0d2, 0xffc145, 0xff6b6b);
    this.addBox(0, -0.5, -41.5, 5 * scale, 0.5, 5, 'solid');
    this.addPendulum(0, 7.6, -38.6, 5.4, plan.sweeperSpeed * 1.15, phase, 0.7);
    this.addPendulum(0, 8.4, -44.2, 5.8, plan.sweeperSpeed * 1.35, phase + 1.9, 0.6);

    this.addPlatform(0, -51, 9 * scale, 8, 0xffffff, 0xa78bfa, 0xffc145, this.beltTexture);
    this.addBox(
      0,
      -0.5,
      -51,
      4.5 * scale,
      0.5,
      4,
      'conveyor',
      new Vector3(plan.conveyorSpeed, 0, 0),
    );
    this.addConveyorRails(0, -51, 9 * scale, 8);
    this.addSign('WHIRLYBIRD ALLEY', 'time the sweepers · ride the belt', 0, 2.9, -34, 3.4, 1.2);
  }

  private buildSectionC(): void {
    const plan = this.plan;
    const scale = plan.laneScale;
    const phase = plan.sections[2]!.hazardPhase;

    // The Jelly Jumps gaps are tuned generously: a full-speed jump at 8 u/s
    // must clear them even for a bot with a slower takeoff.
    this.addPlatform(0, -58, 7.4 * scale, 5.6, CREAM, 0x59d9b0, 0xff6b6b);
    this.addBox(0, -0.5, -58, 3.7 * scale, 0.5, 2.8, 'solid');

    this.addMotion(
      0,
      -65,
      5.2,
      6,
      'x',
      2.2,
      0.72,
      phase,
    );
    this.addPlatform(0, -72, 6.2 * scale, 5.6, CREAM, 0xffc145, 0x57c7ff);
    this.addBox(0, -0.5, -72, 3.1 * scale, 0.5, 2.8, 'solid');
    this.addBouncePad(0, -72);

    this.addPlatform(0, -80.5, 6 * scale, 6.4, CREAM, 0x57c7ff, 0x59d9b0);
    this.addBox(0, -0.5, -80.5, 3 * scale, 0.5, 3.2, 'solid');

    this.addMotion(
      0,
      -88,
      5.2,
      6,
      'x',
      2.4,
      0.92,
      phase + 2.4,
    );
    this.addPlatform(0, -94.5, 7.2 * scale, 6.4, CREAM, 0x59d9b0, 0xffc145);
    this.addBox(0, -0.5, -94.5, 3.6 * scale, 0.5, 3.2, 'solid');

    this.addSign('JELLY JUMPS', 'commit to the gap · use the pad', 0, 2.6, -72, 3.1, 1.1);
  }

  private buildSectionD(): void {
    const plan = this.plan;
    const scale = plan.laneScale;
    const phase = plan.sections[3]!.hazardPhase;

    this.addPlatform(0, -98.5, 7.2 * scale, 4.4, CREAM, 0xff9ecb, 0xa78bfa);
    this.addBox(0, -0.5, -98.5, 3.6 * scale, 0.5, 2.2, 'solid');

    // Angled slime slide down from 0 to -1.6 over 12 units.
    const rampAngle = -Math.atan2(1.6, 12);
    const rampQuaternion = new Quaternion().setFromEuler(new Euler(rampAngle, 0, 0));
    const ramp = makePlatform(
      6.4 * scale,
      12.8,
      0xffe0f0,
      0xa78bfa,
      0xff6b6b,
      null,
      this.materials,
    );
    ramp.position.set(0, -0.85, -107.5);
    ramp.rotation.x = rampAngle;
    this.staticVisuals.add(ramp);
    this.colliders.push(
      createBoxCollider({
        kind: 'solid',
        position: new Vector3(0, -1.35, -107.5),
        halfExtents: new Vector3(3.2 * scale, 0.5, 6.4),
        quaternion: rampQuaternion,
      }),
    );

    // Narrow-ish bridge at the bottom of the slide. It has to leave a bean a
    // lane to recover after a pusher, especially for the AI pack.
    this.addPlatform(0, -118.5, 6.8 * scale, 13, CREAM, 0xa78bfa, 0xffc145, null, -1.6);
    this.addBox(0, -2.1, -118.5, 3.4 * scale, 0.5, 6.5, 'solid');

    // Moving pusher walls: solid, with surface velocity, so they can sweep.
    this.addPusher(0, -112.8, -0.9, 1.4, 2.3, plan.pusherSpeed * 0.6, phase, 1.2);
    this.addPusher(0, -117.6, -0.9, 1.4, 2.3, plan.pusherSpeed * 0.85, phase + 1.6, 1.4);
    this.addPusher(0, -122.4, -0.9, 1.4, 2.3, plan.pusherSpeed * 0.7, phase + 3.1, 1.1);

    if (plan.shortcut.enabled) {
      const x = plan.shortcut.side * (4.6 * scale);
      this.addPlatform(x, plan.shortcut.z, plan.shortcut.width, 13, 0xfff0d2, 0x59d9b0, 0xff6b6b, null, -1.6);
      this.addBox(x, -2.1, plan.shortcut.z, plan.shortcut.width / 2, 0.5, 6.5, 'solid');
      this.addSign('RISKY', 'narrow · one wobble', x, -0.5, plan.shortcut.z, 2.1, 0.8);
    }

    this.addPlatform(0, -129.5, 7.4 * scale, 9.5, CREAM, 0xffc145, 0x59d9b0, null, -1.6);
    this.addBox(0, -2.1, -129.5, 3.7 * scale, 0.5, 4.75, 'solid');
    this.addSign('SLIME SLIDE', 'lean into the pushers · trust the bridge', 0, 2.5, -118, 3.4, 1.2);
  }

  private buildSectionE(): void {
    const plan = this.plan;
    const scale = plan.laneScale;
    const steps: ReadonlyArray<readonly [number, number, number, number]> = [
      [-133.5, -1.0, 6.4, 4.2],
      [-137.5, 0.1, 6.4, 4.2],
      [-141.5, 1.2, 6.0, 4.2],
      [-145.5, 2.3, 5.8, 4.2],
      [-149.5, 3.4, 5.8, 4.2],
    ];
    for (const [z, y, width, depth] of steps) {
      this.addPlatform(0, z, width * scale, depth, CREAM, 0xff6b6b, 0xffc145, null, y);
      this.addBox(0, y - 0.5, z, (width * scale) / 2, 0.5, depth / 2, 'solid');
    }

    const finishWidth = plan.finishWidth * Math.max(0.9, scale);
    this.addPlatform(0, -156, finishWidth, 10, 0xffffff, 0x59d9b0, 0xffc145, this.finishChecker(), 4.5);
    this.addBox(0, 4.0, -156, finishWidth / 2, 0.5, 5, 'solid');
    this.buildFinishGate(finishWidth);

    const crowd = this.plan.crowdArrangement;
    const crowdLeft = makeCrowd(14, 6, new Rng(this.seed ^ 0xc0a1), 0xffc145, this.materials);
    crowdLeft.position.set(-finishWidth / 2 - 4.4, 4.7, -154);
    crowdLeft.rotation.y = Math.PI / 2.2;
    this.group.add(crowdLeft);
    this.crowd.push({
      group: crowdLeft,
      baseY: 4.7 + ((crowd[0] ?? 0.5) - 0.5) * 0.24,
      phase: (crowd[0] ?? 0.5) * Math.PI * 2,
    });
    const crowdRight = makeCrowd(14, 6, new Rng(this.seed ^ 0xc0a2), 0xff6b6b, this.materials);
    crowdRight.position.set(finishWidth / 2 + 4.4, 4.7, -154);
    crowdRight.rotation.y = -Math.PI / 2.2;
    this.group.add(crowdRight);
    this.crowd.push({
      group: crowdRight,
      baseY: 4.7 + ((crowd[1] ?? 0.5) - 0.5) * 0.24,
      phase: (crowd[1] ?? 0.5) * Math.PI * 2,
    });
  }

  // ------------------------------------------------------------------ Builders

  private buildFinishGate(width: number): void {
    const gold = this.materials.toon({ color: 0xffc145 });
    for (const side of [-1, 1]) {
      const post = new Mesh(new CylinderGeometry(0.26, 0.34, 4.4, 12), gold);
      post.position.set(side * (width / 2 - 0.4), 6.7, -155.2);
      post.castShadow = true;
      this.staticVisuals.add(post);
      const knob = new Mesh(new SphereGeometry(0.42, 14, 10), gold);
      knob.position.set(side * (width / 2 - 0.4), 9.1, -155.2);
      this.staticVisuals.add(knob);
    }

    this.finishSign.position.set(0, 10.4, -155.2);
    this.group.add(this.finishSign);
    const sign = makeSign('FINISH GATE', 'qualify for the next round', 5.2, 1.9, this.ownedTextures, this.materials);
    this.finishSign.add(sign);

    const crown = new Group();
    crown.position.set(0, 11.7, -155.2);
    const band = new Mesh(new CylinderGeometry(0.52, 0.58, 0.28, 7), gold);
    crown.add(band);
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      const spike = new Mesh(new CylinderGeometry(0.03, 0.13, 0.52, 5), gold);
      spike.position.set(Math.cos(angle) * 0.4, 0.34, Math.sin(angle) * 0.4);
      crown.add(spike);
    }
    this.staticVisuals.add(crown);

    const lineTexture = makeCheckerTexture('#24324a', '#fff6e5');
    lineTexture.repeat.set(6, 1);
    this.ownedTextures.add(lineTexture);
    const line = new Mesh(
      new RoundedBoxGeometry(width - 1.2, 0.04, 0.7, 2, 0.02),
      this.materials.toon({ color: 0xffffff, map: lineTexture }),
    );
    line.position.set(0, 4.53, -152.4);
    line.receiveShadow = true;
    this.staticVisuals.add(line);
  }

  private buildScenery(rng: Rng): void {
    const islands: ReadonlyArray<readonly [number, number, number, number]> = [
      [-38, 2, 8, 7],
      [39, -1, -14, 8],
      [-42, -4, -42, 6],
      [44, 3, -58, 7],
      [-34, 3, -82, 5.5],
      [37, -2, -96, 6.5],
      [-36, -1, -122, 7],
      [43, 1, -140, 8],
      [-46, 3, -158, 6],
      [47, -3, -170, 7.5],
    ];
    for (const [x, y, z, radius] of islands) {
      const island = makeIsland(radius, rng, this.materials);
      island.position.set(x, y, z);
      this.staticVisuals.add(island);
    }

    // Bunting across the course at Section boundaries.
    const buntingSpots: ReadonlyArray<readonly [number, number, number]> = [
      [0, 13, 14],
      [0, 18, -20],
      [0, 22, -56],
      [0, 22, -95],
      [0, 24, -131],
      [0, 20, -160],
    ];
    for (const [x, width, z] of buntingSpots) {
      this.addBunting(x, z, width, 5.4, 0.4);
    }

    for (let i = 0; i < 10; i += 1) {
      const cloud = makeCloud(rng.float(1.6, 3.4), rng, this.materials);
      const x = rng.float(-62, 62);
      const y = rng.float(9, 30);
      const z = rng.float(-185, 35);
      cloud.position.set(x, y, z);
      this.group.add(cloud);
      this.clouds.push({
        group: cloud,
        baseX: x,
        baseY: y,
        phase: rng.float(0, Math.PI * 2),
        drift: rng.float(0.8, 2.8),
        speed: rng.float(0.03, 0.08),
      });
    }
    for (let i = 0; i < 4; i += 1) {
      const cloud = makeCloud(rng.float(2.6, 4.8), rng, this.materials);
      cloud.position.set(rng.float(-45, 45), rng.float(-13, -8), rng.float(-170, 20));
      this.staticVisuals.add(cloud);
    }

    const balloonColors =
      this.plan.propColors.length > 0
        ? [...this.plan.propColors]
        : [0xff6b6b, 0xffc145, 0x59d9b0, 0x57c7ff, 0xa78bfa, 0xff9ecb];
    for (let i = 0; i < 6; i += 1) {
      const balloon = makeBalloon(balloonColors[i % balloonColors.length]!, this.materials);
      const x = rng.float(-30, 30);
      const y = rng.float(10, 24);
      const z = rng.float(-168, 6);
      balloon.position.set(x, y, z);
      balloon.scale.setScalar(rng.float(0.7, 1.25));
      this.group.add(balloon);
      this.balloons.push({
        group: balloon,
        baseX: x,
        baseY: y,
        phase: rng.float(0, Math.PI * 2),
        drift: rng.float(0.3, 1.2),
        speed: rng.float(0.14, 0.3),
      });
    }

    // Start-side crowd makes the opening shot feel hosted.
    const startCrowd = makeCrowd(16, 8, new Rng(this.seed ^ 0x57a27), 0x59d9b0, this.materials);
    startCrowd.position.set(-13.5, 0.2, 16);
    startCrowd.rotation.y = Math.PI / 2.1;
    this.group.add(startCrowd);
    this.crowd.push({
      group: startCrowd,
      baseY: 0.2 + ((this.plan.crowdArrangement[2] ?? 0.5) - 0.5) * 0.2,
      phase: (this.plan.crowdArrangement[2] ?? 0.5) * Math.PI * 2,
    });
    const startCrowd2 = makeCrowd(16, 8, new Rng(this.seed ^ 0x57a28), 0xffc145, this.materials);
    startCrowd2.position.set(13.5, 0.2, 16);
    startCrowd2.rotation.y = -Math.PI / 2.1;
    this.group.add(startCrowd2);
    this.crowd.push({
      group: startCrowd2,
      baseY: 0.2 + ((this.plan.crowdArrangement[3] ?? 0.5) - 0.5) * 0.2,
      phase: (this.plan.crowdArrangement[3] ?? 0.5) * Math.PI * 2,
    });
  }

  private addSweeper(
    x: number,
    y: number,
    z: number,
    length: number,
    thickness: number,
    speed: number,
    phase: number,
  ): void {
    const visual = new Group();
    visual.position.set(x, y, z);
    const beam = new Mesh(
      new RoundedBoxGeometry(length * 2, thickness, thickness * 1.5, 2, 0.12),
      this.materials.toon({ color: 0xff6b6b, emissive: 0xff6b6b, emissiveIntensity: 0.12 }),
    );
    beam.castShadow = true;
    visual.add(beam);
    const stripe = new Mesh(
      new RoundedBoxGeometry(length * 2 - 0.3, 0.09, thickness * 1.8, 2, 0.04),
      this.materials.toon({ color: 0xfff6e5 }),
    );
    stripe.position.y = 0.03;
    visual.add(stripe);
    const hub = new Mesh(
      new CylinderGeometry(0.42, 0.52, 0.9, 10),
      this.materials.toon({ color: 0xffc145 }),
    );
    visual.add(hub);
    mergeColoredMeshes(visual);
    this.group.add(visual);

    const collider = createBoxCollider({
      kind: 'hazard',
      position: new Vector3(x, y, z),
      halfExtents: new Vector3(length, thickness / 2, thickness * 0.75),
      angularVelocity: new Vector3(0, speed, 0),
    });
    this.colliders.push(collider);
    this.sweepers.push({ collider, visual, speed, phase });
  }

  private addPendulum(
    x: number,
    pivotY: number,
    z: number,
    length: number,
    speed: number,
    phase: number,
    amplitude: number,
  ): void {
    const pivot = new Vector3(x, pivotY, z);
    const arm = new Group();
    arm.position.copy(pivot);
    const rod = new Mesh(
      new CylinderGeometry(0.09, 0.11, length, 8),
      this.materials.toon({ color: 0xfff6e5 }),
    );
    rod.position.y = -length / 2;
    arm.add(rod);
    const bob = new Mesh(
      new RoundedBoxGeometry(1.5, 1.15, 1.5, 3, 0.3),
      this.materials.toon({ color: 0xff6b6b, emissive: 0xff6b6b, emissiveIntensity: 0.1 }),
    );
    bob.position.y = -length;
    bob.castShadow = true;
    arm.add(bob);
    const face = new Mesh(
      new SphereGeometry(0.28, 10, 8),
      this.materials.toon({ color: 0xfff6e5 }),
    );
    face.position.set(0, -length, 0.78);
    arm.add(face);
    mergeColoredMeshes(arm);
    this.group.add(arm);

    const collider = createBoxCollider({
      kind: 'hazard',
      position: new Vector3(x, pivotY - length, z),
      halfExtents: new Vector3(0.85, 0.65, 0.85),
    });
    this.colliders.push(collider);
    this.pendulums.push({ collider, arm, pivot, length, speed, phase, amplitude });
  }

  private addMotion(
    x: number,
    z: number,
    width: number,
    depth: number,
    axis: 'x' | 'y' | 'z',
    amplitude: number,
    speed: number,
    phase: number,
  ): void {
    const visual = makePlatform(width, depth, 0xffc145, 0xff6b6b, 0xfff6e5);
    mergeColoredMeshes(visual);
    const base = new Vector3(x, 0, z);
    visual.position.set(x, 0, z);
    this.group.add(visual);
    const collider = createBoxCollider({
      kind: 'solid',
      position: new Vector3(x, -0.5, z),
      halfExtents: new Vector3(width / 2, 0.5, depth / 2),
    });
    this.colliders.push(collider);
    // Capture the seeded offset so the first step has no velocity spike.
    const initial = Math.sin(phase) * amplitude;
    collider.position[axis] += initial;
    collider.prevPosition.copy(collider.position);
    visual.position.copy(collider.position).add(new Vector3(0, 0.5, 0));
    this.motions.push({
      collider,
      visual,
      base,
      axis,
      amplitude,
      speed,
      phase,
      visualOffsetY: 0.5,
    });
  }

  private addPusher(
    x: number,
    z: number,
    y: number,
    width: number,
    height: number,
    speed: number,
    phase: number,
    amplitude: number,
  ): void {
    const visual = new Group();
    visual.position.set(x, y, z);
    const bar = new Mesh(
      new RoundedBoxGeometry(width, height, 0.9, 3, 0.18),
      this.materials.toon({ color: 0xa78bfa, emissive: 0xff6b6b, emissiveIntensity: 0.12 }),
    );
    bar.castShadow = true;
    visual.add(bar);
    const stripes = new Mesh(
      new RoundedBoxGeometry(width - 0.2, 0.2, 0.96, 2, 0.05),
      this.materials.toon({ color: 0xfff6e5 }),
    );
    stripes.position.y = height * 0.22;
    visual.add(stripes);
    mergeColoredMeshes(visual);
    this.group.add(visual);

    const collider = createBoxCollider({
      kind: 'hazard',
      position: new Vector3(x, y, z),
      halfExtents: new Vector3(width / 2, height / 2, 0.45),
    });
    this.colliders.push(collider);
    const initial = Math.sin(phase) * amplitude;
    collider.position.x += initial;
    collider.prevPosition.copy(collider.position);
    visual.position.x += initial;
    this.motions.push({
      collider,
      visual,
      base: new Vector3(x, y, -118.5),
      axis: 'x',
      amplitude,
      speed,
      phase,
      visualOffsetY: 0,
    });
  }

  private addHurdle(x: number, z: number, width: number, height: number): void {
    const material = this.materials.toon({ color: 0xff6b6b });
    const hurdle = new Mesh(new RoundedBoxGeometry(width, height, 0.48, 3, 0.14), material);
    hurdle.position.set(x, height / 2, z);
    hurdle.castShadow = true;
    this.staticVisuals.add(hurdle);
    const stripeMaterial = this.materials.toon({ color: 0xfff6e5 });
    for (let i = -1; i <= 1; i += 1) {
      const stripe = new Mesh(
        new RoundedBoxGeometry(0.48, height - 0.06, 0.54, 2, 0.05),
        stripeMaterial,
      );
      stripe.position.set(x + i * (width / 3.2), height / 2, z);
      this.staticVisuals.add(stripe);
    }
    this.addBox(x, height / 2, z, width / 2, height / 2, 0.24, 'solid');
  }

  private addBouncePad(x: number, z: number): void {
    this.padVisual.position.set(x, 0, z);
    this.group.add(this.padVisual);
    const base = new Mesh(
      new CylinderGeometry(1.42, 1.55, 0.18, 24),
      this.materials.toon({ color: 0xff6b6b }),
    );
    base.position.y = 0.09;
    base.castShadow = true;
    this.padVisual.add(base);
    const cushion = new Mesh(
      new CylinderGeometry(1.2, 1.24, 0.18, 24),
      this.materials.toon({ color: 0xffc145 }),
    );
    cushion.position.y = 0.25;
    this.padVisual.add(cushion);
    const ring = new Mesh(
      new TorusGeometry(1.06, 0.06, 8, 28),
      this.materials.toon({ color: 0xfff6e5 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.35;
    this.padVisual.add(ring);
    mergeColoredMeshes(this.padVisual);
    this.addCylinder(x, 0.18, z, 1.25, 0.36, 'bounce', 15);
  }

  private addConveyorRails(x: number, z: number, width: number, depth: number): void {
    const railMaterial = this.materials.toon({ color: 0xfff6e5 });
    for (const side of [-1, 1]) {
      const rail = new Mesh(
        new RoundedBoxGeometry(0.26, 0.4, depth, 2, 0.08),
        railMaterial,
      );
      rail.position.set(x + side * (width / 2 - 0.12), 0.18, z);
      rail.castShadow = true;
      this.staticVisuals.add(rail);
    }
  }

  private addBunting(x: number, z: number, width: number, poleHeight: number, baseY: number): void {
    for (const side of [-1, 1]) {
      const pole = makePole(poleHeight, 0xfff6e5, this.materials);
      pole.position.set(x + side * (width / 2), baseY, z);
      this.staticVisuals.add(pole);
      const knob = new Mesh(
        new SphereGeometry(0.16, 10, 8),
        this.materials.toon({ color: 0xffc145 }),
      );
      knob.position.set(x + side * (width / 2), baseY + poleHeight + 0.06, z);
      this.staticVisuals.add(knob);
    }
    const bunting = makeBuntingLine(
      width,
      14,
      new Rng(this.seed ^ Math.floor((z + 200) * 131)),
    );
    bunting.position.set(x, baseY + poleHeight - 0.02, z);
    this.staticVisuals.add(bunting);
  }

  private addSign(
    title: string,
    subtitle: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
  ): void {
    const sign = makeSign(title, subtitle, width, height, this.ownedTextures, this.materials);
    sign.position.set(x, y, z);
    this.staticVisuals.add(sign);
    for (const side of [-1, 1]) {
      const post = makePole(y + height / 2, 0xfff6e5, this.materials);
      post.position.set(x + side * (width / 2 - 0.3), 0, z + 0.2);
      this.group.add(post);
    }
  }

  private addStartLine(z: number, width: number): void {
    const texture = makeCheckerTexture('#ff6b6b', '#fff6e5');
    texture.repeat.set(6, 1);
    this.ownedTextures.add(texture);
    const line = new Mesh(
      new RoundedBoxGeometry(width - 1.4, 0.04, 0.8, 2, 0.02),
      this.materials.toon({ color: 0xffffff, map: texture }),
    );
    line.position.set(0, 0.03, z - 2.4);
    line.receiveShadow = true;
    this.staticVisuals.add(line);

    const arrowTexture = makeArrowTexture();
    this.ownedTextures.add(arrowTexture);
    const arrowMaterial = new MeshBasicMaterial({
      map: arrowTexture,
      transparent: true,
      depthWrite: false,
      side: 2,
      toneMapped: false,
    });
    for (const spot of [
      [0, 10],
      [0, -20],
      [0, -56],
      [0, -96],
      [0, -132],
    ] as const) {
      const arrow = new Mesh(new PlaneGeometry(2.2, 2.2), arrowMaterial);
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.set(spot[0], 0.05, spot[1]);
      arrow.renderOrder = 2;
      this.staticVisuals.add(arrow);
    }
  }

  private finishChecker(): Texture {
    const texture = makeCheckerTexture('#fff6e5', '#ff6b6b');
    texture.repeat.set(3, 3);
    this.ownedTextures.add(texture);
    return texture;
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
    const platform = makePlatform(
      width,
      depth,
      topColor,
      sideColor,
      trimColor,
      topTexture,
      this.materials,
    );
    platform.position.set(x, y, z);
    this.staticVisuals.add(platform);
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

  // ------------------------------------------------------------------ Contract

  step(dt: number, bodies: readonly BeanBody[]): void {
    this.elapsed += dt;
    const body = bodies[0];
    if (body) this.bodyProgress = this.progress(body.position);

    for (const sweeper of this.sweepers) {
      const angle = sweeper.phase + this.elapsed * sweeper.speed;
      sweeper.visual.rotation.y = angle;
      this.scratchQuaternion.setFromAxisAngle(UP_AXIS, angle);
      setColliderTransform(
        sweeper.collider,
        sweeper.collider.position,
        this.scratchQuaternion,
        dt,
      );
      sweeper.collider.angularVelocity.set(0, sweeper.speed, 0);
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

    for (const motion of this.motions) {
      const offset = Math.sin(this.elapsed * motion.speed + motion.phase) * motion.amplitude;
      const x =
        motion.axis === 'x' ? motion.base.x + offset : motion.collider.position.x;
      const y =
        motion.axis === 'y' ? motion.base.y + offset : motion.collider.position.y;
      const z =
        motion.axis === 'z' ? motion.base.z + offset : motion.collider.position.z;
      moveCollider(motion.collider, x, y, z, dt);
      // The collider centre is half a unit below the platform's top surface.
      motion.visual.position.set(
        motion.collider.position.x,
        motion.collider.position.y + motion.visualOffsetY,
        motion.collider.position.z,
      );
    }
  }

  animate(elapsed: number, dt: number): void {
    this.beltTexture.offset.x = (elapsed * 0.75) % 1;
    this.beltTexture.offset.y = 0;
    this.padVisual.scale.set(1 + Math.sin(elapsed * 3.4) * 0.035, 1, 1 + Math.sin(elapsed * 3.4) * 0.035);

    for (const cloud of this.clouds) {
      cloud.group.position.x =
        cloud.baseX + Math.sin(elapsed * cloud.speed + cloud.phase) * cloud.drift;
      cloud.group.position.y = cloud.baseY + Math.sin(elapsed * 0.16 + cloud.phase) * 0.24;
    }
    for (const balloon of this.balloons) {
      balloon.group.position.x =
        balloon.baseX + Math.sin(elapsed * 0.22 + balloon.phase) * balloon.drift;
      balloon.group.position.y =
        balloon.baseY + Math.sin(elapsed * 0.4 + balloon.phase) * 0.4;
      balloon.group.rotation.z = Math.sin(elapsed * 0.26 + balloon.phase) * 0.05;
    }
    for (const crowd of this.crowd) {
      crowd.group.position.y = crowd.baseY + Math.abs(Math.sin(elapsed * 2.1 + crowd.phase)) * 0.14;
    }
    this.finishSign.rotation.z = Math.sin(elapsed * 1.5) * 0.012;
    this.confetti.update(dt, elapsed);
  }

  resetKinematics(): void {
    this.elapsed = 0;
    this.result = null;
    this.bodyProgress = 0;
    for (const sweeper of this.sweepers) {
      const angle = sweeper.phase;
      sweeper.visual.rotation.y = angle;
      sweeper.collider.quaternion.setFromAxisAngle(UP_AXIS, angle);
      sweeper.collider.prevQuaternion.copy(sweeper.collider.quaternion);
      sweeper.collider.velocity.set(0, 0, 0);
      sweeper.collider.angularVelocity.set(0, sweeper.speed, 0);
    }
    for (const pendulum of this.pendulums) {
      const swing = Math.sin(pendulum.phase) * pendulum.amplitude;
      pendulum.arm.rotation.z = swing;
      pendulum.collider.position.set(
        pendulum.pivot.x + Math.sin(swing) * pendulum.length,
        pendulum.pivot.y - Math.cos(swing) * pendulum.length,
        pendulum.pivot.z,
      );
      pendulum.collider.prevPosition.copy(pendulum.collider.position);
      pendulum.collider.velocity.set(0, 0, 0);
    }
    for (const motion of this.motions) {
      const offset = Math.sin(motion.phase) * motion.amplitude;
      motion.collider.position.copy(motion.base);
      motion.collider.position[motion.axis] += offset;
      motion.collider.prevPosition.copy(motion.collider.position);
      motion.collider.velocity.set(0, 0, 0);
      motion.visual.position.set(
        motion.collider.position.x,
        motion.collider.position.y + motion.visualOffsetY,
        motion.collider.position.z,
      );
    }
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

  setQuality(quality: Quality): void {
    const high = quality === 'high';
    this.directional.castShadow = high;
    this.confetti.setDensity(high);
  }

  /** The single low hurdle is jumped; no side-lane detour is needed. */
  hurdleLane(_z: number): number {
    return 0;
  }

  progress(position: Vector3): number {
    // The finish gate sits at finishPosition, inside the planned section E
    // envelope. Progress must read 100% on the gate, not 95% at the plan end.
    return clamp(
      (this.plan.startZ - position.z) / (this.plan.startZ - this.finishPosition.z),
      0,
      1,
    );
  }

  isAtFinish(position: Vector3): boolean {
    return (
      position.y > 4.45 && position.z < -152 && position.z > -162 && Math.abs(position.x) < 6
    );
  }

  status(): LevelStatus {
    const percent = Math.round(this.bodyProgress * 100);
    const section = this.sectionAt(this.bodyProgress);
    return {
      mode: this.mode,
      title: this.title,
      objective: this.objective,
      elapsed: this.elapsed,
      timeLimit: 120,
      progress: this.bodyProgress,
      progressLabel: `${percent}%`,
      metricLabel: 'PROGRESS',
      metricValue: `${percent}%`,
      phase: this.result ? 'FINISHED' : section ? `SECTION ${section.id} · ${section.name}` : 'SHOWTIME',
      result: this.result,
    };
  }

  finishNow(): LevelResult {
    if (!this.result) {
      this.result = {
        kind: 'finish',
        title: 'QUALIFIED!',
        detail: 'You hit the Finish Gate. The next Round is still being built.',
        time: this.elapsed,
        winner: null,
      };
    }
    return this.result;
  }

  dispose(): void {
    disposeObject(this.group, this.ownedTextures);
    this.materials.dispose();
    this.confetti.dispose();
  }

  private sectionAt(progress: number): CourseSectionPlan | null {
    if (progress <= 0) return null;
    const z = this.plan.startZ - progress * (this.plan.startZ - this.plan.finishZ);
    for (const section of this.plan.sections) {
      if (z <= section.startZ && z >= section.endZ) return section;
    }
    return this.plan.sections[4] ?? null;
  }

  private buildWaypoints(): Waypoint[] {
    const actions: ReadonlyArray<readonly [number, number, number, Waypoint['action']]> = [
      [0, 16, 0.02, 'run'],
      [0, 10, 0.02, 'jump'],
      [0, 8.2, 0.02, 'jump'],
      [0, 4, 0.02, 'run'],
      [0, -3.5, 0.02, 'jump'],
      [0, -10, 0.02, 'run'],
      [0, -16.5, 0.02, 'jump'],
      [0, -21, 0.02, 'run'],
      [0, -30, 0.02, 'run'],
      [0, -41, 0.02, 'jump'],
      [0, -51, 0.02, 'ride'],
      [0, -58, 0.02, 'jump'],
      [0, -65, 0.02, 'ride'],
      [0, -72, 0.02, 'jump'],
      [0, -80.5, 0.02, 'jump'],
      [0, -88, 0.02, 'ride'],
      [0, -94.5, 0.02, 'jump'],
      [0, -98.5, 0.02, 'run'],
      [0, -107.5, -0.8, 'ride'],
      [0, -118.5, -1.58, 'run'],
      [0, -129.5, -1.58, 'jump'],
      [0, -133.5, -0.98, 'jump'],
      [0, -137.5, 0.12, 'jump'],
      [0, -141.5, 1.22, 'jump'],
      [0, -145.5, 2.32, 'jump'],
      [0, -149.5, 3.42, 'jump'],
      [0, -156, 4.52, 'run'],
    ];
    return actions.map(([x, z, y, action], index) => ({
      position: new Vector3(x + this.plan.platformOffset * (index % 2 === 0 ? 0.3 : -0.3), y, z),
      action,
      radius: action === 'jump' ? 1.5 : 1.1,
      lane: index % 3,
    }));
  }
}
