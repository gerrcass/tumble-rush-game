import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import type { Quality } from '../levels/Level';

export type BurstKind = 'qualify' | 'finish' | 'crown' | 'splat' | 'confetti';

export interface BurstPalette {
  colors: readonly number[];
  count: number;
  speed: number;
  spread: number;
  gravity: number;
  life: number;
  size: number;
}

/** Seeded, readable palettes. The effect is presentation only; no gameplay maths. */
const PALETTES: Readonly<Record<BurstKind, BurstPalette>> = {
  qualify: {
    colors: [0x59d9b0, 0xfff6e5, 0xffc145, 0x57c7ff],
    count: 34,
    speed: 6.2,
    spread: 0.55,
    gravity: 11,
    life: 1.25,
    size: 1,
  },
  finish: {
    colors: [0xffc145, 0xff6b6b, 0x59d9b0, 0x57c7ff, 0xa78bfa, 0xfff6e5],
    count: 48,
    speed: 7.4,
    spread: 0.45,
    gravity: 10,
    life: 1.6,
    size: 1.15,
  },
  crown: {
    colors: [0xffc145, 0xfff6e5, 0xff6b6b, 0xa78bfa, 0x57c7ff],
    count: 78,
    speed: 9.2,
    spread: 0.9,
    gravity: 7.5,
    life: 2.2,
    size: 1.35,
  },
  splat: {
    colors: [0xff4fa3, 0xff9ecb, 0xffc2dd, 0xa78bfa],
    count: 30,
    speed: 4.6,
    spread: 0.7,
    gravity: 15,
    life: 0.95,
    size: 1.25,
  },
  confetti: {
    colors: [0xff6b6b, 0xffc145, 0x59d9b0, 0x57c7ff, 0xa78bfa, 0xfff6e5],
    count: 26,
    speed: 5.2,
    spread: 0.8,
    gravity: 8,
    life: 1.5,
    size: 1,
  },
};

export interface ParticleBudget {
  maxParticles: number;
  scale: number;
}

/** Pure quality/reduced-motion budget so the effect never blows the frame. */
export function particleBudget(quality: Quality, reducedMotion: boolean): ParticleBudget {
  if (reducedMotion) return { maxParticles: 46, scale: 0.45 };
  return quality === 'high' ? { maxParticles: 180, scale: 1 } : { maxParticles: 84, scale: 0.7 };
}

function paletteFor(kind: BurstKind): BurstPalette {
  return PALETTES[kind];
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  rotation: number;
  spin: number;
  size: number;
}

/**
 * Pooled confetti/slime bursts. One InstancedMesh, one draw call, hard particle
 * cap. Bursts are event-driven (qualify, finish, crown, splat) rather than an
 * extra per-frame scene graph.
 */
export class Bursts {
  readonly mesh: InstancedMesh;
  private readonly maxParticles: number;
  private readonly particles: Particle[] = [];
  private readonly dummy = new Object3D();
  private readonly color = new Color();
  private readonly geometry: PlaneGeometry;
  private readonly material: MeshBasicMaterial;
  private scale = 1;

  constructor(maxParticles = 180) {
    this.maxParticles = Math.max(12, maxParticles);
    this.geometry = new PlaneGeometry(0.18, 0.13);
    this.material = new MeshBasicMaterial({
      side: DoubleSide,
      toneMapped: false,
      transparent: false,
    });
    this.mesh = new InstancedMesh(this.geometry, this.material, this.maxParticles);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
  }

  setBudget(budget: ParticleBudget): void {
    this.scale = budget.scale;
    if (this.particles.length > budget.maxParticles) {
      this.particles.length = budget.maxParticles;
      this.mesh.count = this.particles.length;
    }
  }

  /** Spawn at a world position. `intensity` scales count for small moments. */
  spawn(kind: BurstKind, x: number, y: number, z: number, intensity = 1): void {
    const palette = paletteFor(kind);
    const requested = Math.min(
      this.maxParticles - this.particles.length,
      Math.max(4, Math.round(palette.count * this.scale * intensity)),
    );
    for (let i = 0; i < requested; i += 1) {
      const angle = (i / requested) * Math.PI * 2 + i * 0.618;
      const elevation = 0.36 + ((i * 37) % 100) / 100 * 0.85;
      const speed = palette.speed * (0.55 + ((i * 53) % 100) / 100 * 0.8);
      const horizontal = Math.cos(elevation) * speed;
      const particle: Particle = {
        x,
        y: y + 0.4,
        z,
        vx: Math.cos(angle) * horizontal * palette.spread + (kind === 'splat' ? 0 : 1.1),
        vy: Math.sin(elevation) * speed + 2.2,
        vz: Math.sin(angle) * horizontal * palette.spread,
        life: palette.life * (0.75 + ((i * 29) % 100) / 250),
        maxLife: palette.life,
        rotation: angle * 2,
        spin: (i % 2 === 0 ? 1 : -1) * (3 + (i % 7)),
        size: palette.size * (0.7 + ((i * 17) % 100) / 180),
      };
      this.particles.push(particle);
      this.mesh.setColorAt(
        this.particles.length - 1,
        this.color.setHex(palette.colors[i % palette.colors.length]!),
      );
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = this.particles.length;
  }

  update(dt: number): void {
    const gravity = -10;
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i]!;
      particle.life -= dt;
      if (particle.life <= 0) {
        const last = this.particles.pop()!;
        if (i < this.particles.length) this.particles[i] = last;
        continue;
      }
      particle.vy += gravity * dt;
      particle.vx *= 1 - 1.4 * dt;
      particle.vz *= 1 - 1.4 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.rotation += particle.spin * dt;
    }
    this.mesh.count = this.particles.length;
    for (let i = 0; i < this.particles.length; i += 1) {
      const particle = this.particles[i]!;
      const fade = Math.min(1, particle.life / (particle.maxLife * 0.45));
      this.dummy.position.set(particle.x, particle.y, particle.z);
      this.dummy.rotation.set(particle.rotation, particle.rotation * 0.7, particle.rotation * 0.3);
      this.dummy.scale.setScalar(Math.max(0.001, particle.size * fade));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (this.particles.length > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }

  get activeCount(): number {
    return this.particles.length;
  }

  dispose(): void {
    this.particles.length = 0;
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
