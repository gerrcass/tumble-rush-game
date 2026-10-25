import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  Object3D,
  SphereGeometry,
  Texture,
  TorusGeometry,
  Vector3,
} from 'three';
import { Rng } from '../Rng';
import type { BeanBody } from '../physics/BeanBody';
import {
  createCylinderCollider,
  type Collider,
} from '../physics/Collider';
import { makeToonMaterial } from '../util/toon';
import {
  disposeObject,
  makeBalloon,
  makeBuntingLine,
  makeCloud,
  makeCrowd,
  makeIsland,
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
  LevelTile,
  Quality,
  Waypoint,
} from './Level';
import { hexDisc, hexRing, hexToWorld, type Axial } from './hexGrid';

type TileState = 'idle' | 'warning' | 'falling' | 'gone';

interface Tile {
  tier: number;
  coord: Axial;
  ring: number;
  base: Vector3;
  state: TileState;
  warning: number;
  fallSpeed: number;
  fallY: number;
  spin: number;
  instanceIndex: number;
  collider: Collider;
  color: Color;
  safe: boolean;
}

interface Drifter {
  group: Group;
  baseX: number;
  baseY: number;
  phase: number;
  drift: number;
  speed: number;
}

interface Bubble {
  mesh: Mesh;
  baseX: number;
  baseZ: number;
  phase: number;
  speed: number;
}

const TIER_RADII = [4, 3, 2] as const;
const TIER_Y = [0, -2.8, -5.6] as const;
/** Slight cascade keeps all three tiers readable from the follow camera. */
const TIER_OFFSETS = [
  { x: 0, z: 0 },
  { x: 3.6, z: 0 },
  { x: -3.2, z: 2.2 },
] as const;
const TILE_SIZE = 1.15;
const TILE_WARNING = 0.45;
const SLIME_Y = -9.5;
const ROUND_LIMIT = 75;
/** The starting perch holds for this long, then drops away with the floor. */
const PERCH_GRACE = 3.4;
const TOTAL_TILES = 61 + 37 + 19;

/**
 * Hexapop — the collapsing-tile survival Round.
 *
 * Three honeycomb tiers hang over lethal pink slime. Every touch starts a
 * readable 0.45 s warning before the tile drops and its collider is disabled.
 * Sugar Rush removes the current outer ring on a timer so the Round always
 * ends. Tile state, collapse waves and the slime plane are all seeded/authored
 * here; Game owns elimination and the HUD.
 */
export class Hexapop implements Level {
  readonly mode: LevelMode = 'hexapop';
  readonly title = 'HEXAPOP';
  readonly objective = 'Survive the Sugar Rush';
  readonly group = new Group();
  readonly colliders: Collider[] = [];
  readonly startPosition = new Vector3(0, 0.43, 0);
  readonly finishPosition = new Vector3(0, 0, 0);
  readonly respawnAllowed = false;
  readonly killY = -9.7;
  readonly cameraFloor = -8.55;
  readonly waypoints: readonly Waypoint[];
  readonly checkpoints: readonly Checkpoint[] = [
    { position: new Vector3(0, 0.43, 0) },
  ];
  readonly slimeHeight = SLIME_Y;
  readonly slime = new Group();

  private readonly seed: number;
  private readonly ownedTextures = new Set<Texture>();
  private readonly colorScratch = new Color();
  private readonly flashScratch = new Color();
  private readonly tiles: Tile[] = [];
  private readonly tileMesh: InstancedMesh;
  private readonly dummy = new Object3D();
  private readonly bubbleList: Bubble[] = [];
  private readonly clouds: Drifter[] = [];
  private readonly balloons: Drifter[] = [];
  private readonly crowd: Group[] = [];
  private readonly directional: DirectionalLight;
  private slimeMesh!: Mesh;
  private readonly rims: Mesh[] = [];
  private readonly podium = new Group();
  private podiumCollider: Collider | null = null;
  private readonly safeTileIndices = new Set<number>();
  private perchOpen = false;
  private perchTimer = PERCH_GRACE;
  private tileSnapshot: LevelTile[] = [];
  private snapshotVersion = -1;
  private tileVersion = 0;
  private elapsed = 0;
  private nextWaveAt = 45;
  private result: LevelResult | null = null;
  private tileCountValue = TOTAL_TILES;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const rng = new Rng((this.seed ^ 0x4e6a9) >>> 0);
    this.group.add(makeSky());
    this.group.add(new HemisphereLight(0xffe8ee, 0x7fd4ff, 0.58));

    this.directional = new DirectionalLight(0xfff1d6, 1.3);
    this.directional.position.set(18, 32, 20);
    this.directional.castShadow = true;
    this.directional.shadow.mapSize.set(1024, 1024);
    this.directional.shadow.camera.left = -16;
    this.directional.shadow.camera.right = 16;
    this.directional.shadow.camera.top = 16;
    this.directional.shadow.camera.bottom = -18;
    this.directional.shadow.camera.near = 1;
    this.directional.shadow.camera.far = 80;
    this.directional.shadow.bias = -0.0004;
    this.directional.shadow.normalBias = 0.03;
    this.group.add(this.directional);
    this.directional.target.position.set(0, -2, 0);
    this.group.add(this.directional.target);

    // Cool fill from below keeps tile undersides and the slime readable when
    // the follow camera looks up through the tiers.
    const fill = new DirectionalLight(0xffd0e6, 0.45);
    fill.position.set(-8, -14, 12);
    this.group.add(fill);
    fill.target.position.set(0, -3, 0);
    this.group.add(fill.target);

    this.buildSlime(rng);
    this.buildTiers(rng);
    this.tileMesh = this.buildTileMesh(rng);
    this.buildTierRims();
    this.buildPodium();
    this.buildScenery(rng);

    this.waypoints = this.buildWaypoints();
  }

  // ------------------------------------------------------------------ Build

  private buildSlime(rng: Rng): void {
    const material = makeToonMaterial({
      color: 0xff4fa3,
      emissive: 0xff4fa3,
      emissiveIntensity: 0.18,
    });
    this.slimeMesh = new Mesh(new CircleGeometry(30, 48), material);
    this.slimeMesh.rotation.x = -Math.PI / 2;
    this.slimeMesh.position.y = SLIME_Y;
    this.slimeMesh.receiveShadow = true;
    this.slime.add(this.slimeMesh);

    const ring = new Mesh(
      new TorusGeometry(29.2, 0.55, 8, 64),
      makeToonMaterial({ color: 0xff9ecb, emissive: 0xff4fa3, emissiveIntensity: 0.25 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = SLIME_Y + 0.35;
    this.slime.add(ring);

    const bubbleGeometry = new SphereGeometry(0.35, 10, 8);
    for (let i = 0; i < 18; i += 1) {
      const bubble = new Mesh(
        bubbleGeometry,
        makeToonMaterial({ color: 0xffc2dd, emissive: 0xff4fa3, emissiveIntensity: 0.2 }),
      );
      const x = rng.float(-17, 17);
      const z = rng.float(-17, 17);
      bubble.position.set(x, SLIME_Y + rng.float(0.1, 0.5), z);
      const scale = rng.float(0.45, 1.2);
      bubble.scale.setScalar(scale);
      this.slime.add(bubble);
      this.bubbleList.push({
        mesh: bubble,
        baseX: x,
        baseZ: z,
        phase: rng.float(0, Math.PI * 2),
        speed: rng.float(0.5, 1.2),
      });
    }
    this.group.add(this.slime);
  }

  private buildTiers(rng: Rng): void {
    const palette = [0xff6b6b, 0xffc145, 0x59d9b0, 0x57c7ff, 0xa78bfa, 0xff9ecb];
    const tierTint = [0xffc145, 0x59d9b0, 0x57c7ff];
    for (let tier = 0; tier < TIER_RADII.length; tier += 1) {
      const radius = TIER_RADII[tier]!;
      const baseY = TIER_Y[tier]!;
      const cells = hexDisc(radius);
      const tierRng = rng.fork(tier + 11);
      for (const coord of cells) {
        const ring = Math.max(
          Math.abs(coord.q),
          Math.abs(coord.r),
          Math.abs(coord.q + coord.r),
        );
        const position = hexToWorld(coord, TILE_SIZE);
        const offset = TIER_OFFSETS[tier]!;
        const tile: Tile = {
          tier,
          coord,
          ring,
          base: new Vector3(position.x + offset.x, baseY, position.z + offset.z),
          state: 'idle',
          warning: 0,
          fallSpeed: 0,
          fallY: 0,
          spin: tierRng.float(-2.4, 2.4),
          instanceIndex: this.tiles.length,
          collider: createCylinderCollider({
            kind: 'solid',
            position: new Vector3(position.x + offset.x, baseY - 0.13, position.z + offset.z),
            radius: TILE_SIZE * 0.88,
            height: 0.26,
          }),
          color: new Color(
            tier === 0 && coord.q === 0 && coord.r === 0
              ? 0xfff6e5
              : palette[
                  (((coord.q * 2 + coord.r * 3 + tier * 2 + tierRng.int(0, 1)) %
                    palette.length) +
                    palette.length) %
                    palette.length
                ]!,
          ),
          safe: tier === 0 && coord.q === 0 && coord.r === 0,
        };
        tile.color.lerp(new Color(tierTint[tier]!), 0.18);
        if (tile.safe) this.safeTileIndices.add(this.tiles.length);
        this.colliders.push(tile.collider);
        this.tiles.push(tile);
      }
    }
  }

  private buildTileMesh(rng: Rng): InstancedMesh {
    const geometry = new CylinderGeometry(1.03, 1.03, 0.26, 6);
    const material = makeToonMaterial({ color: 0xffffff });
    const mesh = new InstancedMesh(geometry, material, this.tiles.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const color = new Color();
    for (const tile of this.tiles) {
      this.dummy.position.set(tile.base.x, tile.base.y - 0.13, tile.base.z);
      this.dummy.rotation.set(0, Math.PI / 6, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(tile.instanceIndex, this.dummy.matrix);
      color.copy(tile.color).offsetHSL(rng.float(-0.015, 0.015), 0, rng.float(-0.03, 0.03));
      mesh.setColorAt(tile.instanceIndex, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
    return mesh;
  }

  private buildTierRims(): void {
    const tints = [0xffc145, 0x59d9b0, 0x57c7ff];
    for (let tier = 0; tier < TIER_RADII.length; tier += 1) {
      const radius = TIER_RADII[tier]!;
      const rim = new Mesh(
        new CylinderGeometry(
          radius * TILE_SIZE * 1.78,
          radius * TILE_SIZE * 1.84,
          0.5,
          6,
        ),
        makeToonMaterial({ color: tints[tier]! }),
      );
      rim.position.set(TIER_OFFSETS[tier]!.x, TIER_Y[tier]! - 0.36, TIER_OFFSETS[tier]!.z);
      rim.rotation.y = Math.PI / 6;
      rim.castShadow = true;
      rim.receiveShadow = true;
      this.group.add(rim);
      this.rims.push(rim);
    }
  }

  private buildPodium(): void {
    const podium = this.podium;
    podium.position.set(0, 0.2, 0);
    const base = new Mesh(
      new CylinderGeometry(1.5, 1.7, 0.4, 24),
      makeToonMaterial({ color: 0xffc145 }),
    );
    base.castShadow = true;
    base.receiveShadow = true;
    podium.add(base);
    const top = new Mesh(
      new CylinderGeometry(1.3, 1.34, 0.12, 24),
      makeToonMaterial({ color: 0xfff6e5 }),
    );
    top.position.y = 0.24;
    podium.add(top);
    const ring = new Mesh(
      new TorusGeometry(1.38, 0.06, 8, 26),
      makeToonMaterial({ color: 0xff6b6b }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.22;
    podium.add(ring);
    this.group.add(podium);
    this.podiumCollider = createCylinderCollider({
      kind: 'solid',
      position: new Vector3(0, 0.2, 0),
      radius: 1.55,
      height: 0.4,
    });
    this.colliders.push(this.podiumCollider);
    const sign = makeSign('HEXAPOP', 'do not trust the floor', 4.2, 1.5, this.ownedTextures);
    sign.position.set(0, 3.1, -3.6);
    this.group.add(sign);
    for (const side of [-1, 1]) {
      const pole = makePole(3.1);
      pole.position.set(side * 2.2, 0.4, -3.6);
      this.group.add(pole);
    }
  }

  private buildScenery(rng: Rng): void {
    const positions: ReadonlyArray<readonly [number, number, number, number]> = [
      [-22, -1, -18, 5],
      [24, 2, -14, 6],
      [-26, 0, 22, 5.5],
      [21, -3, 21, 4.5],
      [-30, -4, 2, 6],
      [30, 4, 4, 5],
    ];
    for (const [x, y, z, radius] of positions) {
      const island = makeIsland(radius, rng);
      island.position.set(x, y, z);
      this.group.add(island);
    }

    for (let i = 0; i < 8; i += 1) {
      const cloud = makeCloud(rng.float(1.6, 3.4), rng);
      const x = rng.float(-38, 38);
      const y = rng.float(7, 24);
      const z = rng.float(-34, 34);
      cloud.position.set(x, y, z);
      this.group.add(cloud);
      this.clouds.push({
        group: cloud,
        baseX: x,
        baseY: y,
        phase: rng.float(0, Math.PI * 2),
        drift: rng.float(0.6, 2.4),
        speed: rng.float(0.03, 0.08),
      });
    }

    const colors = [0xff6b6b, 0xffc145, 0x59d9b0, 0x57c7ff, 0xa78bfa];
    for (let i = 0; i < 6; i += 1) {
      const balloon = makeBalloon(colors[i % colors.length]!);
      const x = rng.float(-26, 26);
      const y = rng.float(8, 18);
      const z = rng.float(-28, 26);
      balloon.position.set(x, y, z);
      balloon.scale.setScalar(rng.float(0.7, 1.2));
      this.group.add(balloon);
      this.balloons.push({
        group: balloon,
        baseX: x,
        baseY: y,
        phase: rng.float(0, Math.PI * 2),
        drift: rng.float(0.3, 1),
        speed: rng.float(0.15, 0.3),
      });
    }

    for (let tier = 0; tier < 3; tier += 1) {
      const audience = makeCrowd(
        12,
        6,
        new Rng(this.seed ^ (0xa0d1 + tier)),
        [0xffc145, 0xff6b6b, 0x59d9b0][tier]!,
      );
      audience.position.set(-18 + tier * 18, -0.4, 16 - tier * 9);
      audience.rotation.y = Math.PI;
      this.group.add(audience);
      this.crowd.push(audience);
    }

    const bunting = makeBuntingLine(34, 18, new Rng(this.seed ^ 0xb007));
    bunting.position.set(0, 6.4, -8);
    this.group.add(bunting);
  }

  private buildWaypoints(): Waypoint[] {
    // The centre of each tier, then the next ring out. Phase-three bots can
    // choose a neighbouring tile and hop based on collapse risk.
    const points: Waypoint[] = [
      { position: new Vector3(0, 0.43, 0), action: 'run', radius: 1.2 },
    ];
    for (let tier = 0; tier < TIER_RADII.length; tier += 1) {
      const cells = hexRing(TIER_RADII[tier]!);
      for (let i = 0; i < Math.min(6, cells.length); i += 1) {
        const position = hexToWorld(cells[i]!, TILE_SIZE);
        points.push({
          position: new Vector3(
            position.x + TIER_OFFSETS[tier]!.x,
            TIER_Y[tier]! + 0.1,
            position.z + TIER_OFFSETS[tier]!.z,
          ),
          action: tier === 2 ? 'run' : 'jump',
          radius: 1.1,
        });
      }
    }
    return points;
  }

  // ------------------------------------------------------------------ Contract

  step(dt: number, bodies: readonly BeanBody[]): void {
    this.elapsed += dt;

    // The safe start perch is temporary: a short grace, then the podium
    // collider disables and the centre tile is just another collapsing hex.
    // An idle player therefore cannot survive by standing still.
    if (!this.perchOpen) {
      this.perchTimer -= dt;
      if (this.perchTimer <= 0) this.openPerch();
    }

    // One slime plane for every body, player and bot alike.
    for (const body of bodies) {
      if (body.position.y < this.killY) body.eliminated = true;
    }

    // Touch-to-collapse. The safe centre tile is only safe during the grace.
    for (const bodyToCheck of bodies) {
      if (bodyToCheck.eliminated) continue;
      for (const tile of this.tiles) {
        if (tile.state !== 'idle' || tile.safe) continue;
        if (Math.abs(bodyToCheck.position.y - tile.base.y) > 0.55) continue;
        const dx = bodyToCheck.position.x - tile.base.x;
        const dz = bodyToCheck.position.z - tile.base.z;
        if (dx * dx + dz * dz < 0.9 * 0.9) this.warnTile(tile);
      }
    }

    let changed = false;
    for (const tile of this.tiles) {
      if (tile.state === 'warning') {
        tile.warning -= dt;
        if (tile.warning <= 0) {
          tile.state = 'falling';
          tile.collider.enabled = false;
          tile.fallSpeed = 0;
          tile.fallY = 0;
          this.tileCountValue -= 1;
        }
        changed = this.updateTileMatrix(tile) || changed;
      } else if (tile.state === 'falling') {
        tile.fallSpeed += 26 * dt;
        tile.fallY -= tile.fallSpeed * dt;
        if (tile.fallY < -7) {
          tile.state = 'gone';
          this.dummy.position.set(tile.base.x, tile.base.y - 12, tile.base.z);
          this.dummy.scale.set(0, 0, 0);
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.updateMatrix();
          this.tileMesh.setMatrixAt(tile.instanceIndex, this.dummy.matrix);
        } else {
          this.updateTileMatrix(tile);
        }
        changed = true;
      }
    }
    if (changed) this.tileMesh.instanceMatrix.needsUpdate = true;

    if (this.elapsed >= this.nextWaveAt && this.tileCountValue > 4) {
      this.collapseOuterRing();
      const interval = this.elapsed >= 65 ? 2.5 : 4;
      this.nextWaveAt += interval;
    }

    if (!this.result && this.tileCountValue <= 4) {
      this.result = {
        kind: 'survived',
        title: 'SURVIVED!',
        detail: `The Sugar Rush ate the floor. ${this.tileCountValue} tiles left standing.`,
        time: this.elapsed,
        winner: null,
      };
    }
    if (!this.result && this.elapsed >= ROUND_LIMIT) {
      this.result = {
        kind: 'survived',
        title: 'ROUND OVER',
        detail: `Time! ${this.tileCountValue} tiles survived the Sugar Rush.`,
        time: this.elapsed,
        winner: null,
      };
    }
    this.tileVersion += 1;
  }

  animate(elapsed: number, dt: number): void {
    this.slimeMesh.scale.set(1 + Math.sin(elapsed * 0.8) * 0.012, 1, 1 + Math.sin(elapsed * 0.8) * 0.012);
    this.slime.rotation.y = elapsed * 0.01;
    for (const bubble of this.bubbleList) {
      bubble.mesh.position.y =
        SLIME_Y + 0.25 + Math.abs(Math.sin(elapsed * bubble.speed + bubble.phase)) * 0.5;
      bubble.mesh.position.x = bubble.baseX + Math.sin(elapsed * 0.4 + bubble.phase) * 0.35;
      bubble.mesh.position.z = bubble.baseZ + Math.cos(elapsed * 0.33 + bubble.phase) * 0.35;
    }
    for (const cloud of this.clouds) {
      cloud.group.position.x =
        cloud.baseX + Math.sin(elapsed * cloud.speed + cloud.phase) * cloud.drift;
      cloud.group.position.y = cloud.baseY + Math.sin(elapsed * 0.18 + cloud.phase) * 0.22;
    }
    for (const balloon of this.balloons) {
      balloon.group.position.x =
        balloon.baseX + Math.sin(elapsed * 0.2 + balloon.phase) * balloon.drift;
      balloon.group.position.y =
        balloon.baseY + Math.sin(elapsed * 0.36 + balloon.phase) * 0.35;
    }
    for (let i = 0; i < this.crowd.length; i += 1) {
      const group = this.crowd[i];
      if (group) group.position.y = -0.4 + Math.abs(Math.sin(elapsed * 2 + i)) * 0.16;
    }
    for (let i = 0; i < this.rims.length; i += 1) {
      const rim = this.rims[i];
      if (rim) rim.rotation.y = Math.PI / 6 + elapsed * (0.02 + i * 0.01);
    }
    void dt;
  }

  resetKinematics(): void {
    this.elapsed = 0;
    this.nextWaveAt = 45;
    this.result = null;
    this.tileCountValue = TOTAL_TILES;
    this.perchOpen = false;
    this.perchTimer = PERCH_GRACE;
    this.podium.visible = true;
    if (this.podiumCollider) this.podiumCollider.enabled = true;
    for (const tile of this.tiles) {
      tile.state = 'idle';
      tile.warning = 0;
      tile.fallSpeed = 0;
      tile.fallY = 0;
      tile.collider.enabled = true;
      tile.safe = false;
      this.dummy.position.set(tile.base.x, tile.base.y - 0.13, tile.base.z);
      this.dummy.rotation.set(0, Math.PI / 6, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.tileMesh.setMatrixAt(tile.instanceIndex, this.dummy.matrix);
      this.tileMesh.setColorAt(tile.instanceIndex, tile.color);
    }
    for (const index of this.safeTileIndices) {
      const tile = this.tiles[index];
      if (tile) tile.safe = true;
    }
    this.tileMesh.instanceMatrix.needsUpdate = true;
    if (this.tileMesh.instanceColor) this.tileMesh.instanceColor.needsUpdate = true;
    this.tileVersion += 1;
  }

  checkpointFor(_position: Vector3, current: number): number {
    return current;
  }

  setQuality(quality: Quality): void {
    this.directional.castShadow = quality === 'high';
  }

  progress(position: Vector3): number {
    // Vertical survival progress: the lower the Tumbler, the more precarious.
    return Math.max(0, Math.min(1, (position.y - SLIME_Y) / (0 - SLIME_Y)));
  }

  /**
   * Public tile snapshot for bot brains, tests and future spectator UI.
   * Returned objects are copies: the arena remains the only owner of state.
   */
  queryTiles(): readonly LevelTile[] {
    // Bots all ask the same question in the same fixed step. Build the array
    // once per step instead of allocating ~117 objects per bot per step.
    if (this.snapshotVersion !== this.tileVersion) {
      this.snapshotVersion = this.tileVersion;
      this.tileSnapshot = this.tiles.map((tile) => ({
        x: tile.base.x,
        y: tile.base.y,
        z: tile.base.z,
        tier: tile.tier,
        ring: tile.ring,
        state: tile.state,
        safe: tile.safe,
      }));
    }
    return this.tileSnapshot;
  }

  nearestSafeTile(position: Vector3): LevelTile | null {
    let best: LevelTile | null = null;
    let bestScore = Infinity;
    for (const tile of this.queryTiles()) {
      if (tile.state !== 'idle') continue;
      const vertical = tile.y - position.y;
      if (vertical > 1.4 || vertical < -4.2) continue;
      const distance = Math.hypot(tile.x - position.x, tile.z - position.z);
      if (distance > 7) continue;
      const score = distance + Math.abs(vertical) * 1.1 + tile.ring * 0.18;
      if (score < bestScore) {
        bestScore = score;
        best = tile;
      }
    }
    return best;
  }

  /** Centre tile first, then the inner rings: a spread start without a pile. */
  spawnPoints(count: number): readonly Vector3[] {
    const tierZero = this.tiles
      .filter((tile) => tile.tier === 0)
      .sort((a, b) => {
        if (a.ring !== b.ring) return a.ring - b.ring;
        return Math.atan2(a.base.z, a.base.x) - Math.atan2(b.base.z, b.base.x);
      });
    const points: Vector3[] = [];
    for (const tile of tierZero) {
      points.push(new Vector3(tile.base.x, tile.base.y, tile.base.z));
      if (points.length >= count) break;
    }
    return points;
  }

  isAtFinish(_position: Vector3): boolean {
    return false;
  }

  get tileCount(): number {
    return this.tileCountValue;
  }

  get winner(): string | null {
    return this.result?.winner ?? null;
  }

  status(): LevelStatus {
    const percent = Math.round((1 - this.tileCountValue / TOTAL_TILES) * 100);
    const phase =
      this.elapsed >= 45 ? 'SUGAR RUSH' : this.elapsed >= 30 ? 'THE FLOOR IS NERVOUS' : 'STEADY';
    return {
      mode: this.mode,
      title: this.title,
      objective: this.objective,
      elapsed: this.elapsed,
      timeLimit: ROUND_LIMIT,
      progress: 1 - this.tileCountValue / TOTAL_TILES,
      progressLabel: `${percent}%`,
      metricLabel: 'TILES LEFT',
      metricValue: `${this.tileCountValue} / ${TOTAL_TILES}`,
      phase,
      result: this.result,
    };
  }

  finishNow(): LevelResult {
    if (!this.result) {
      this.result = {
        kind: 'survived',
        title: 'SURVIVED!',
        detail: `${this.tileCountValue} tiles left. The slime is still hungry.`,
        time: this.elapsed,
        winner: null,
      };
    }
    return this.result;
  }

  dispose(): void {
    disposeObject(this.group, this.ownedTextures);
  }

  private openPerch(): void {
    this.perchOpen = true;
    this.podium.visible = false;
    if (this.podiumCollider) this.podiumCollider.enabled = false;
    for (const index of this.safeTileIndices) {
      const tile = this.tiles[index];
      if (tile) tile.safe = false;
    }
    this.tileVersion += 1;
  }

  private warnTile(tile: Tile): void {
    tile.state = 'warning';
    tile.warning = TILE_WARNING;
    this.tileMesh.setColorAt(tile.instanceIndex, this.flashScratch.set(0xfff6e5));
    if (this.tileMesh.instanceColor) this.tileMesh.instanceColor.needsUpdate = true;
  }

  private updateTileMatrix(tile: Tile): boolean {
    const warningShake = tile.state === 'warning' ? Math.max(0, tile.warning / TILE_WARNING) : 0;
    const shake = Math.sin(this.elapsed * 75 + tile.instanceIndex) * 0.045 * warningShake;
    this.dummy.position.set(
      tile.base.x + shake,
      tile.base.y - 0.13 + tile.fallY + (tile.state === 'warning' ? Math.sin(this.elapsed * 90) * 0.015 : 0),
      tile.base.z + Math.cos(this.elapsed * 68) * 0.02 * warningShake,
    );
    this.dummy.rotation.set(
      tile.state === 'falling' ? tile.fallY * 0.35 : warningShake * 0.06,
      Math.PI / 6 + (tile.state === 'falling' ? tile.fallY * tile.spin * 0.1 : 0),
      tile.state === 'falling' ? tile.fallY * tile.spin * 0.2 : warningShake * 0.05,
    );
    this.dummy.scale.set(1, 1, 1);
    this.dummy.updateMatrix();
    this.tileMesh.setMatrixAt(tile.instanceIndex, this.dummy.matrix);
    if (this.tileMesh.instanceColor) {
      if (tile.state === 'warning') {
        const flash = 0.55 + Math.abs(Math.sin(this.elapsed * 22)) * 0.45;
        this.colorScratch.copy(tile.color).lerp(this.flashScratch.set(0xffffff), flash);
        this.tileMesh.setColorAt(tile.instanceIndex, this.colorScratch);
        this.tileMesh.instanceColor.needsUpdate = true;
      } else if (tile.state === 'falling') {
        this.colorScratch.copy(tile.color).multiplyScalar(0.65);
        this.tileMesh.setColorAt(tile.instanceIndex, this.colorScratch);
        this.tileMesh.instanceColor.needsUpdate = true;
      }
    }
    return true;
  }

  private collapseOuterRing(): void {
    let outer = -1;
    for (const tile of this.tiles) {
      if (tile.state === 'idle' || tile.state === 'warning') {
        outer = Math.max(outer, tile.ring);
      }
    }
    if (outer < 0) return;
    for (const tile of this.tiles) {
      if (tile.ring === outer && tile.state === 'idle') {
        tile.safe = false;
        this.warnTile(tile);
      }
    }
  }
}
