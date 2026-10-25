import {
  BackSide,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  Matrix4,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Texture,
} from 'three';
import {
  canvasTexture,
  getToonGradient,
  makeSignTexture,
  makeToonMaterial,
  getSunTexture,
} from '../util/toon';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rng } from '../Rng';
import { clamp } from '../util/math';
import type { ToonMaterialOptions } from '../util/toon';

/**
 * Per-Level toon material pool. Repeated candy colours are shared so static
 * geometry can be merged into a handful of meshes instead of one per object.
 * The pool is owned by the Level and disposed with it.
 */
export interface MaterialCache {
  toon(options: ToonMaterialOptions): MeshToonMaterial;
  dispose(): void;
}

export function createMaterialCache(): MaterialCache {
  const cache = new Map<string, MeshToonMaterial>();
  return {
    toon(options: ToonMaterialOptions): MeshToonMaterial {
      const key = [
        String(options.color),
        options.map?.uuid ?? '',
        options.transparent ? 1 : 0,
        options.opacity ?? 1,
        options.emissive ?? 0,
        options.emissiveIntensity ?? 1,
      ].join('|');
      let material = cache.get(key);
      if (!material) {
        material = makeToonMaterial(options);
        cache.set(key, material);
      }
      return material;
    },
    dispose(): void {
      for (const material of cache.values()) material.dispose();
      cache.clear();
    },
  };
}

function toon(materials: MaterialCache | undefined, options: ToonMaterialOptions): MeshToonMaterial {
  return materials ? materials.toon(options) : makeToonMaterial(options);
}

/**
 * mergeGeometries needs one consistent attribute/index layout. Static Course
 * props mix rounded boxes, cylinders, spheres and planes; flatten them to a
 * common non-indexed position/normal/uv layout first. Triangle count is
 * unchanged.
 */
function normalizeForMerge(source: BufferGeometry): BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const allowed = new Set(['position', 'normal', 'uv']);
  for (const name of Object.keys(geometry.attributes)) {
    if (!allowed.has(name)) geometry.deleteAttribute(name);
  }
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  if (!geometry.getAttribute('uv')) {
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  return geometry;
}

function makeVertexColorMaterial(): MeshToonMaterial {
  return new MeshToonMaterial({
    color: 0xffffff,
    vertexColors: true,
    gradientMap: getToonGradient(),
  });
}

/**
 * Collapse every mesh in a group into one geometry with baked vertex colours
 * and a single toon material. Used for procedurally-coloured props such as
 * hats: their parts are tiny, and five material buckets per hat were five draw
 * calls per Tumbler. Subtrees marked userData.keep stay separate (spinning
 * propeller, bobbing halo) and may be merged on their own first.
 */
export function mergeColoredMeshes(group: Group): void {
  group.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(group.matrixWorld).invert();
  const matrix = new Matrix4();
  const sources: Mesh[] = [];
  group.traverse((object) => {
    if (!(object instanceof Mesh) || object instanceof InstancedMesh) return;
    let cursor: Object3D | null = object;
    while (cursor && cursor !== group) {
      if (cursor.userData.keep === true) return;
      cursor = cursor.parent;
    }
    sources.push(object);
  });
  if (sources.length === 0) return;

  const parts: BufferGeometry[] = [];
  let castShadow = false;
  let receiveShadow = false;
  const color = new Color();
  for (const mesh of sources) {
    const sourceMaterial = Array.isArray(mesh.material) ? null : mesh.material;
    if (!sourceMaterial || !('color' in sourceMaterial)) continue;
    // Textured faces (signs, conveyor tops, checker lines) keep their own
    // material and draw call; vertex colour cannot carry a map.
    if ('map' in sourceMaterial && sourceMaterial.map) continue;
    const geometry = normalizeForMerge(mesh.geometry);
    geometry.deleteAttribute('uv');
    matrix.multiplyMatrices(inverse, mesh.matrixWorld);
    geometry.applyMatrix4(matrix);
    color.copy((sourceMaterial as MeshToonMaterial).color);
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    parts.push(geometry);
    castShadow ||= mesh.castShadow;
    receiveShadow ||= mesh.receiveShadow;
  }
  if (parts.length === 0) return;
  const merged = mergeGeometries(parts, false);
  for (const geometry of parts) geometry.dispose();
  if (!merged) return;
  const sourceGeometries = new Set<BufferGeometry>();
  for (const mesh of sources) {
    const sourceMaterial = Array.isArray(mesh.material) ? null : mesh.material;
    if (
      !sourceMaterial ||
      !('color' in sourceMaterial) ||
      ('map' in sourceMaterial && sourceMaterial.map)
    ) {
      continue;
    }
    sourceGeometries.add(mesh.geometry);
    mesh.removeFromParent();
  }
  for (const geometry of sourceGeometries) geometry.dispose();
  const mesh = new Mesh(merged, makeVertexColorMaterial());
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  group.add(mesh);
}

/**
 * Collapse a flat group of static meshes into one mesh per material. Distant
 * scenery (clouds, islands) was previously 5–8 draw calls each; this keeps the
 * art but drops the call count. Only use it on groups with no per-mesh
 * animation and no InstancedMesh.
 */
export function mergeStaticMeshes(group: Group): void {
  group.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(group.matrixWorld).invert();
  const matrix = new Matrix4();
  interface Bucket {
    material: Material;
    geometries: BufferGeometry[];
    castShadow: boolean;
    receiveShadow: boolean;
  }
  const buckets = new Map<Material, Bucket>();
  const sources: Mesh[] = [];
  group.traverse((object) => {
    if (object instanceof Mesh && !(object instanceof InstancedMesh)) {
      let cursor: Object3D | null = object;
      while (cursor && cursor !== group) {
        if (cursor.userData.keep === true) return;
        cursor = cursor.parent;
      }
      sources.push(object);
    }
  });
  for (const mesh of sources) {
    const sourceMaterial = Array.isArray(mesh.material) ? null : mesh.material;
    if (!sourceMaterial) continue;
    const geometry = normalizeForMerge(mesh.geometry);
    matrix.multiplyMatrices(inverse, mesh.matrixWorld);
    geometry.applyMatrix4(matrix);
    let bucket = buckets.get(sourceMaterial);
    if (!bucket) {
      bucket = {
        material: sourceMaterial,
        geometries: [],
        castShadow: false,
        receiveShadow: false,
      };
      buckets.set(sourceMaterial, bucket);
    }
    bucket.geometries.push(geometry);
    bucket.castShadow ||= mesh.castShadow;
    bucket.receiveShadow ||= mesh.receiveShadow;
  }
  if (buckets.size === 0) return;
  const sourceGeometries = new Set<BufferGeometry>();
  for (const mesh of sources) {
    sourceGeometries.add(mesh.geometry);
    mesh.removeFromParent();
  }
  for (const bucket of buckets.values()) {
    const merged = mergeGeometries(bucket.geometries, false);
    for (const geometry of bucket.geometries) geometry.dispose();
    if (!merged) continue;
    const mesh = new Mesh(merged, bucket.material);
    mesh.castShadow = bucket.castShadow;
    mesh.receiveShadow = bucket.receiveShadow;
    group.add(mesh);
  }
  for (const geometry of sourceGeometries) geometry.dispose();
}

export function makePlatform(
  width: number,
  depth: number,
  topColor: string | number,
  sideColor: string | number,
  trimColor: string | number,
  topTexture: Texture | null = null,
  materials?: MaterialCache,
): Group {
  const group = new Group();
  const slab = new Mesh(
    new RoundedBoxGeometry(width, 1, depth, 2, Math.min(0.16, width * 0.05)),
    toon(materials, { color: sideColor }),
  );
  slab.position.y = -0.55;
  slab.castShadow = true;
  slab.receiveShadow = true;
  group.add(slab);

  const top = new Mesh(
    new RoundedBoxGeometry(width - 0.14, 0.12, depth - 0.14, 2, 0.05),
    toon(materials, { color: topColor, map: topTexture }),
  );
  top.position.y = -0.06;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  const trim = new Mesh(
    new RoundedBoxGeometry(width + 0.06, 0.09, depth + 0.06, 2, 0.035),
    toon(materials, { color: trimColor }),
  );
  trim.position.y = -0.185;
  trim.castShadow = false;
  trim.receiveShadow = true;
  group.add(trim);

  return group;
}

/** Gradient sky dome built from vertex colours — no shader surprises. */
export function makeSky(): Group {
  const group = new Group();
  const radius = 180;
  const geometry = new SphereGeometry(radius, 32, 20);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const horizon = new Color('#ffd8c2');
  const zenith = new Color('#46bff6');
  const under = new Color('#ffc3d4');
  const scratch = new Color();
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i) / radius;
    if (y >= 0) {
      scratch.copy(horizon).lerp(zenith, Math.pow(clamp(y, 0, 1), 0.3));
    } else {
      scratch.copy(horizon).lerp(under, Math.pow(clamp(-y * 1.8, 0, 1), 0.7));
    }
    colors[i * 3] = scratch.r;
    colors[i * 3 + 1] = scratch.g;
    colors[i * 3 + 2] = scratch.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const skyMaterial = new MeshBasicMaterial({
    vertexColors: true,
    side: BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const dome = new Mesh(geometry, skyMaterial);
  dome.renderOrder = -20;
  group.add(dome);

  const sun = new Sprite(
    new SpriteMaterial({
      map: getSunTexture(),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    }),
  );
  sun.position.set(48, 12, -118);
  sun.scale.set(54, 54, 1);
  sun.renderOrder = -19;
  group.add(sun);

  return group;
}

export function makeCloud(scale: number, rng: Rng, materials?: MaterialCache): Group {
  const group = new Group();
  const geometry = new SphereGeometry(1, 7, 5);
  const material = toon(materials, {
    color: 0xfff6e5,
    emissive: 0xffe3cf,
    emissiveIntensity: 0.08,
  });
  const puffs = rng.int(4, 6);
  for (let i = 0; i < puffs; i += 1) {
    const puff = new Mesh(geometry, material);
    const size = rng.float(0.55, 1.15);
    puff.scale.set(size * rng.float(1.1, 1.7), size * rng.float(0.55, 0.9), size * rng.float(0.9, 1.35));
    puff.position.set(rng.float(-1.8, 1.8), rng.float(-0.15, 0.5), rng.float(-0.7, 0.7));
    group.add(puff);
  }
  mergeStaticMeshes(group);
  group.scale.setScalar(scale);
  return group;
}

export function makeIsland(radius: number, rng: Rng, materials?: MaterialCache): Group {
  const group = new Group();
  const top = new Mesh(
    new CylinderGeometry(radius, radius * 0.82, 1.1, 9, 1),
    toon(materials, { color: 0x8fe9c8 }),
  );
  top.position.y = -0.55;
  group.add(top);

  const underside = new Mesh(
    new ConeGeometry(radius * 0.82, radius * 1.5, 9, 1),
    toon(materials, { color: 0xffb0c7 }),
  );
  underside.rotation.z = Math.PI;
  underside.position.y = -0.55 - radius * 0.75;
  group.add(underside);

  const trunkMaterial = toon(materials, { color: 0xb3794a });
  const leafColors = [0x59d9b0, 0xffc145, 0xa78bfa] as const;
  const trees = rng.int(1, 3);
  for (let i = 0; i < trees; i += 1) {
    const angle = rng.float(0, Math.PI * 2);
    const distance = rng.float(0.15, 0.62) * radius;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const trunk = new Mesh(new CylinderGeometry(0.09, 0.13, 1.1, 6), trunkMaterial);
    trunk.position.set(x, 0.55, z);
    group.add(trunk);
    const leafMaterial = toon(materials, { color: leafColors[rng.int(0, leafColors.length - 1)]! });
    const foliage = new Mesh(new SphereGeometry(0.55, 10, 8), leafMaterial);
    foliage.position.set(x, 1.35, z);
    foliage.scale.set(1, 0.95, 1);
    group.add(foliage);
  }

  const rocks = new Mesh(
    new SphereGeometry(radius * 0.16, 6, 5),
    toon(materials, { color: 0xfff6e5 }),
  );
  rocks.position.set(-radius * 0.45, 0.06, radius * 0.2);
  group.add(rocks);
  mergeStaticMeshes(group);
  return group;
}

export function makeBalloon(color: number, materials?: MaterialCache): Group {
  const group = new Group();
  const envelope = new Mesh(
    new SphereGeometry(0.78, 16, 12),
    toon(materials, { color }),
  );
  envelope.scale.set(1, 1.17, 1);
  group.add(envelope);
  const band = new Mesh(
    new CylinderGeometry(0.5, 0.56, 0.14, 16),
    toon(materials, { color: 0xfff6e5 }),
  );
  band.position.y = -0.74;
  group.add(band);
  const basket = new Mesh(
    new RoundedBoxGeometry(0.38, 0.3, 0.34, 2, 0.07),
    toon(materials, { color: 0xb3794a }),
  );
  basket.position.y = -1.25;
  group.add(basket);
  const ropeMaterial = new LineBasicMaterial({ color: 0x6b4d36, transparent: true, opacity: 0.75 });
  const ropePoints = new Float32Array(12);
  let cursor = 0;
  for (const side of [-1, 1]) {
    ropePoints.set([side * 0.42, -0.68, 0, side * 0.16, -1.08, 0], cursor);
    cursor += 6;
  }
  const ropeGeometry = new BufferGeometry();
  ropeGeometry.setAttribute('position', new Float32BufferAttribute(ropePoints, 3));
  group.add(new LineSegments(ropeGeometry, ropeMaterial));
  mergeColoredMeshes(group);
  return group;
}

const BUNTING_COLORS = [0xff6b6b, 0xffc145, 0x59d9b0, 0x57c7ff, 0xa78bfa, 0xff9ecb] as const;

export function makeBuntingLine(length: number, flags: number, rng: Rng): Group {
  const group = new Group();
  const points: number[] = [];
  const samples = 18;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const x = (t - 0.5) * length;
    const y = -Math.sin(t * Math.PI) * 0.62;
    points.push(x, y, 0);
  }
  const ropeGeometry = new BufferGeometry();
  ropeGeometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  const rope = new Line(
    ropeGeometry,
    new LineBasicMaterial({ color: 0x24324a, transparent: true, opacity: 0.65 }),
  );
  group.add(rope);

  const flagGeometry = new BufferGeometry();
  flagGeometry.setAttribute(
    'position',
    new Float32BufferAttribute([-0.16, 0.02, 0, 0.16, 0.02, 0, 0, -0.34, 0], 3),
  );
  flagGeometry.computeVertexNormals();
  const flagMaterial = new MeshBasicMaterial({
    side: DoubleSide,
    toneMapped: false,
  });
  const mesh = new InstancedMesh(flagGeometry, flagMaterial, flags);
  const dummy = new Object3D();
  const color = new Color();
  for (let i = 0; i < flags; i += 1) {
    const t = (i + 0.5) / flags;
    const x = (t - 0.5) * length;
    const y = -Math.sin(t * Math.PI) * 0.62;
    dummy.position.set(x, y, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHex(BUNTING_COLORS[(i + rng.int(0, 2)) % BUNTING_COLORS.length]!);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  group.add(mesh);

  return group;
}

export function makePole(height: number, color = 0xfff6e5, materials?: MaterialCache): Mesh {
  const pole = new Mesh(
    new CylinderGeometry(0.075, 0.1, height, 8),
    toon(materials, { color }),
  );
  pole.position.y = height / 2;
  pole.castShadow = true;
  return pole;
}

/**
 * A cheap cheering crowd: one instanced mesh of bean silhouettes on a candy
 * stand. Repeated props stay at one draw call instead of one mesh per spectator.
 */
export function makeCrowd(
  count: number,
  width: number,
  seedRng: Rng,
  baseColor = 0xffc145,
  materials?: MaterialCache,
): Group {
  const group = new Group();
  const stand = new Mesh(
    new RoundedBoxGeometry(width, 0.9, 2.6, 2, 0.12),
    toon(materials, { color: baseColor }),
  );
  stand.position.y = -0.45;
  stand.castShadow = false;
  stand.receiveShadow = true;
  group.add(stand);

  const geometry = new CapsuleGeometry(0.22, 0.46, 1, 4);
  const material = toon(materials, { color: 0xffffff });
  const mesh = new InstancedMesh(geometry, material, count);
  const dummy = new Object3D();
  const color = new Color();
  const palette = [0xff6b6b, 0xffc145, 0x59d9b0, 0x57c7ff, 0xa78bfa, 0xff9ecb, 0xfff6e5];
  const rows = Math.max(1, Math.ceil(count / 10));
  for (let i = 0; i < count; i += 1) {
    const row = i % rows;
    const column = Math.floor(i / rows);
    const x = (column / Math.max(1, Math.ceil(count / rows)) - 0.5) * (width - 1.1);
    const z = (row / Math.max(1, rows - 1) - 0.5) * 1.5;
    const y = row * 0.12;
    const scale = seedRng.float(0.85, 1.15);
    dummy.position.set(x + seedRng.float(-0.16, 0.16), 0.62 + y, z);
    dummy.rotation.set(0, seedRng.float(-0.3, 0.3), 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHex(palette[seedRng.int(0, palette.length - 1)]!);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return group;
}

export function makeSign(
  title: string,
  subtitle: string,
  width: number,
  height: number,
  ownedTextures?: Set<Texture>,
  materials?: MaterialCache,
): Group {
  const group = new Group();
  const signTexture = makeSignTexture(title, subtitle);
  ownedTextures?.add(signTexture);
  const backing = new Mesh(
    new RoundedBoxGeometry(width + 0.18, height + 0.18, 0.14, 2, 0.08),
    toon(materials, { color: 0x24324a }),
  );
  backing.position.z = -0.08;
  group.add(backing);
  const material = new MeshBasicMaterial({
    map: signTexture,
    transparent: true,
    side: DoubleSide,
    toneMapped: false,
  });
  const face = new Mesh(new PlaneGeometry(width, height), material);
  face.position.z = 0.005;
  group.add(face);
  return group;
}

/** Dark conveyor belt with warm chevrons; the texture scrolls in the level. */
export function makeBeltTexture(): Texture {
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#3b4a6b';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#ffc145';
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    for (let row = -1; row < 5; row += 1) {
      const y = row * 64 + 24;
      ctx.beginPath();
      ctx.moveTo(-10, y);
      ctx.lineTo(128, y + 34);
      ctx.lineTo(266, y);
      ctx.stroke();
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-10, y + 28);
      ctx.lineTo(128, y + 62);
      ctx.lineTo(266, y + 28);
      ctx.stroke();
      ctx.strokeStyle = '#ffc145';
      ctx.lineWidth = 11;
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function makeArrowTexture(): Texture {
  const texture = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i += 1) {
      const y = 40 + i * 58;
      ctx.strokeStyle = i === 1 ? '#ffc145' : '#ff6b6b';
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.moveTo(40, y + 36);
      ctx.lineTo(128, y);
      ctx.lineTo(216, y + 36);
      ctx.stroke();
    }
  });
  texture.needsUpdate = true;
  return texture;
}

export function makeCheckerTexture(a = '#fff6e5', b = '#ff6b6b'): Texture {
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 256, 256);
    const size = 32;
    ctx.fillStyle = b;
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * size, y * size, size, size);
      }
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function disposeObject(root: Object3D, ownedTextures: Set<Texture>): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    const asMesh = object as Mesh;
    if (asMesh.geometry) geometries.add(asMesh.geometry as BufferGeometry);
    const material = asMesh.material;
    if (Array.isArray(material)) {
      for (const item of material) materials.add(item);
    } else if (material) {
      materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of ownedTextures) texture.dispose();
  ownedTextures.clear();
  root.removeFromParent();
}
