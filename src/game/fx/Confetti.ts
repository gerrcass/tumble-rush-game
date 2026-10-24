import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import { Rng } from '../Rng';

export interface ConfettiBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

const COLORS = [0xff6b6b, 0xffc145, 0x59d9b0, 0x57c7ff, 0xa78bfa, 0xff9ecb, 0xfff6e5] as const;

/** Cheap ambient confetti. One instanced draw call, seeded motion. */
export class Confetti {
  readonly mesh: InstancedMesh;
  private readonly maxCount: number;
  private readonly bounds: ConfettiBounds;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly fall: Float32Array;
  private readonly phase: Float32Array;
  private readonly spin: Float32Array;
  private readonly size: Float32Array;
  private readonly rotation: Float32Array;
  private readonly dummy = new Object3D();
  private readonly color = new Color();

  constructor(count: number, seed: number, bounds: ConfettiBounds) {
    this.maxCount = count;
    this.bounds = bounds;
    const rng = new Rng(seed);
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.z = new Float32Array(count);
    this.fall = new Float32Array(count);
    this.phase = new Float32Array(count);
    this.spin = new Float32Array(count);
    this.size = new Float32Array(count);
    this.rotation = new Float32Array(count);

    const geometry = new PlaneGeometry(0.12, 0.07);
    const material = new MeshBasicMaterial({
      side: DoubleSide,
      transparent: false,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;

    for (let i = 0; i < count; i += 1) {
      this.x[i] = rng.float(bounds.minX, bounds.maxX);
      this.y[i] = rng.float(bounds.minY, bounds.maxY);
      this.z[i] = rng.float(bounds.minZ, bounds.maxZ);
      this.fall[i] = rng.float(0.5, 1.4);
      this.phase[i] = rng.float(0, Math.PI * 2);
      this.spin[i] = rng.float(-3, 3);
      this.size[i] = rng.float(0.6, 1.4);
      this.rotation[i] = rng.float(0, Math.PI * 2);
      this.color.setHex(COLORS[rng.int(0, COLORS.length - 1)]!);
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = count;
  }

  setDensity(high: boolean): void {
    this.mesh.count = high ? this.maxCount : Math.min(40, this.maxCount);
  }

  update(dt: number, elapsed: number): void {
    const active = this.mesh.count;
    for (let i = 0; i < active; i += 1) {
      let x = this.x[i]!;
      let y = this.y[i]!;
      let z = this.z[i]!;
      y -= this.fall[i]! * dt;
      x += Math.sin(elapsed * 0.9 + this.phase[i]!) * dt * 0.55;
      z += Math.cos(elapsed * 0.7 + this.phase[i]!) * dt * 0.35;
      this.rotation[i] = this.rotation[i]! + this.spin[i]! * dt;
      if (y < this.bounds.minY) {
        y = this.bounds.maxY;
        x = this.bounds.minX + ((i * 97) % 1000) / 1000 * (this.bounds.maxX - this.bounds.minX);
        z = this.bounds.minZ + ((i * 53) % 1000) / 1000 * (this.bounds.maxZ - this.bounds.minZ);
      }
      this.x[i] = x;
      this.y[i] = y;
      this.z[i] = z;
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(this.rotation[i]!, this.rotation[i]! * 0.7, this.rotation[i]! * 0.35);
      this.dummy.scale.setScalar(this.size[i]!);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const material = this.mesh.material;
    if (Array.isArray(material)) {
      for (const item of material) item.dispose();
    } else {
      material.dispose();
    }
    this.mesh.removeFromParent();
  }
}
