import { Quaternion, Vector3 } from 'three';
import { BeanBody } from './BeanBody';
import type { Collider } from './Collider';

export const FIXED_STEP = 1 / 60;
export const GRAVITY = -26;

const MAX_CONTACT_ITERATIONS = 4;
const GROUND_NORMAL_Y = 0.45;
const CONTACT_EPSILON = 0.0001;
const SKIN = 0.00015;
const BEAN_BOUNCE = 0.05;

export interface PhysicsWorldOptions {
  gravity?: number;
  killY?: number;
}

/**
 * Deterministic fixed-step physics for Tumble Rush.
 *
 * Collision approach
 * ------------------
 * Each bean is a vertical capsule represented by two spheres (bottom and top).
 * Every contact iteration tests both spheres against each collider, takes the
 * single deepest overlap, and resolves it. That is enough for the shallow
 * contacts a character controller produces, and it keeps the hot path free of
 * allocation and contact-manifold bookkeeping.
 *
 * Boxes are OBBs: the sphere centre is transformed into box-local space, the
 * closest point on the box is clamped, and the normal/depth are transformed
 * back. Cylinders are capped, Y-aligned cylinders with an exact
 * sphere-to-solid-cylinder distance check (including the top cap and rim).
 *
 * Resolution is collide-and-slide: position first, then remove the velocity
 * component into the surface. Repeated iterations handle corners without
 * tunnelling. The world applies gravity, grounding, kinematic-platform carry,
 * bean-bean impulses, bounce pads and the kill plane. Nothing here uses render
 * delta, Math.random(), or wall-clock time.
 *
 * Moving platforms transfer their per-step delta to beans that were resting on
 * them. Platform delta is applied before integration; this is stable at the
 * 6 u/s platform speeds used by the deck.
 */
export class PhysicsWorld {
  readonly colliders: Collider[] = [];
  readonly bodies: BeanBody[] = [];
  killY: number;
  killPlaneId = 'kill-plane';

  private currentGravity: number;

  private readonly scratchA = new Vector3();
  private readonly localCenter = new Vector3();
  private readonly localClosest = new Vector3();
  private readonly localDelta = new Vector3();
  private readonly localNormal = new Vector3();
  private readonly inverseQuaternion = new Quaternion();
  private readonly sweepPoint = new Vector3();
  private readonly hitCenterStored = new Vector3();
  private readonly surfaceVelocity = new Vector3();
  private readonly scratchRadius = new Vector3();
  private readonly scratchCross = new Vector3();

  private hitCollider: Collider | null = null;
  private hitDepth = 0;
  private lastHazardPulseId = '';
  private readonly hitNormal = new Vector3();

  constructor(options: PhysicsWorldOptions = {}) {
    this.currentGravity = options.gravity ?? GRAVITY;
    this.killY = options.killY ?? -14;
  }

  /** The live gravity used by the next fixed step. */
  get gravity(): number {
    return this.currentGravity;
  }

  /**
   * Install a Round's gravity before its first fixed step. Additive: the
   * integration path is unchanged, so `GRAVITY` is still the classic value.
   */
  setGravity(value: number): void {
    if (!Number.isFinite(value) || value >= 0) {
      throw new Error(`PhysicsWorld.setGravity expects a negative finite value, got ${value}`);
    }
    this.currentGravity = value;
  }

  addCollider(collider: Collider): Collider {
    this.colliders.push(collider);
    return collider;
  }

  /** Drop every collider when switching Rounds. Bodies are managed separately. */
  clearColliders(): void {
    this.colliders.length = 0;
  }

  addBody(body: BeanBody): BeanBody {
    this.bodies.push(body);
    return body;
  }

  removeBody(body: BeanBody): void {
    const index = this.bodies.indexOf(body);
    if (index >= 0) this.bodies.splice(index, 1);
  }

  /**
   * Advance one fixed step. No timers, no rendering, no allocations.
   * `dt` should always be FIXED_STEP in the game loop; tests may use it too.
   */
  step(dt: number): void {
    if (dt <= 0) return;

    for (const body of this.bodies) {
      if (body.eliminated || body.frozen) continue;
      this.stepBody(body, dt);
    }

    this.resolveBeanPairs();
    this.resolveBeanPairs();

    for (const body of this.bodies) {
      if (body.eliminated || body.frozen) continue;
      if (body.position.y < this.killY) body.eliminated = true;
    }
  }

  /** Apply an extra horizontal impulse from a shove or dive. */
  applyShove(from: BeanBody, to: BeanBody, strength: number): void {
    this.scratchA.subVectors(to.position, from.position);
    this.scratchA.y = 0;
    if (this.scratchA.lengthSq() < 1e-6) {
      this.scratchA.copy(from.velocity);
      this.scratchA.y = 0;
    }
    if (this.scratchA.lengthSq() < 1e-6) this.scratchA.set(0, 0, -1);
    this.scratchA.normalize();
    to.velocity.addScaledVector(this.scratchA, strength);
    to.velocity.y += strength * 0.16;
    to.grounded = false;
    to.support = null;
  }

  /**
   * Sphere-cast the third-person camera and return the fraction of the desired
   * segment that is safe. Sampling is deliberate: the deck has few colliders,
   * and this is robust at the corners where analytic sweeps get fiddly.
   */
  sweepCamera(from: Vector3, to: Vector3, radius = 0.24): number {
    const steps = 22;
    let safe = 1;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      this.sweepPoint.lerpVectors(from, to, t);
      if (this.overlapsAny(this.sweepPoint, radius)) {
        safe = Math.max(0.06, (i - 1) / steps);
        break;
      }
    }
    return safe;
  }

  /** True when a camera-sized sphere at `point` intersects world geometry. */
  pointBlocked(point: Vector3, radius = 0.24): boolean {
    return this.overlapsAny(point, radius);
  }

  /**
   * Velocity of the material point on a collider at `point`, including the
   * tangential motion of a rotating beam. Used for hazard impulses; contact
   * resolution alone only knows positional overlap.
   */
  surfaceVelocityAt(collider: Collider, point: Vector3, out: Vector3): Vector3 {
    out.copy(collider.velocity);
    if (collider.angularVelocity.lengthSq() > 1e-8) {
      this.scratchRadius.subVectors(point, collider.position);
      this.scratchCross.crossVectors(collider.angularVelocity, this.scratchRadius);
      out.add(this.scratchCross);
    }
    return out;
  }

  private stepBody(body: BeanBody, dt: number): void {
    body.wasGrounded = body.grounded;
    body.landedThisStep = false;
    body.lastImpactSpeed = 0;
    this.lastHazardPulseId = '';

    const support = body.support;
    if (
      support &&
      support.enabled &&
      body.velocity.y <= 0.2 &&
      body.wasGrounded
    ) {
      // Carry the resting bean with the kinematic surface before integration.
      body.position.addScaledVector(
        this.scratchA.subVectors(support.position, support.prevPosition),
        1,
      );
    }

    body.velocity.y += this.gravity * dt;
    body.position.addScaledVector(body.velocity, dt);

    body.grounded = false;
    body.support = null;

    for (let iteration = 0; iteration < MAX_CONTACT_ITERATIONS; iteration += 1) {
      if (!this.findDeepestContact(body)) break;

      const collider = this.hitCollider;
      if (!collider) break;

      if (collider.kind === 'kill') {
        body.eliminated = true;
        return;
      }

      body.position.addScaledVector(this.hitNormal, this.hitDepth + SKIN * 0.5);

      // Resolve against the moving surface, not the world origin: a rotating
      // beam or swinging hammer must transfer its own velocity into the bean.
      this.surfaceVelocityAt(collider, this.hitCenterStored, this.surfaceVelocity);
      const intoSurface =
        (body.velocity.x - this.surfaceVelocity.x) * this.hitNormal.x +
        (body.velocity.y - this.surfaceVelocity.y) * this.hitNormal.y +
        (body.velocity.z - this.surfaceVelocity.z) * this.hitNormal.z;
      const isGround = this.hitNormal.y > GROUND_NORMAL_Y;
      let bounced = false;

      if (intoSurface < 0) {
        const impact = -intoSurface;
        if (impact > body.lastImpactSpeed) body.lastImpactSpeed = impact;
        body.velocity.addScaledVector(this.hitNormal, impact);

        if (isGround && collider.kind === 'bounce' && impact > 0.5) {
          body.velocity.y = collider.bounceStrength;
          body.grounded = false;
          body.support = null;
          body.landedThisStep = true;
          bounced = true;
        }
      }

      this.applyHazardPulse(body, collider);

      if (!bounced && isGround) {
        body.grounded = true;
        body.support = collider;
        if (!body.wasGrounded && body.lastImpactSpeed > 1.5) {
          body.landedThisStep = true;
        }
      }
    }
  }

  /**
   * Tangential impulse from a hazard. Positional overlap alone resolves the
   * penetration but leaves the bean standing still; this is what actually
   * sweeps a Tumbler off a rotating beam or pushes it across a bridge.
   * Applied once per collider per step (the contact loop can revisit it).
   */
  private applyHazardPulse(body: BeanBody, collider: Collider): void {
    const spinning = collider.angularVelocity.lengthSq() > 1e-6;
    if (collider.kind !== 'hazard' && !spinning) return;
    if (this.lastHazardPulseId === collider.id) return;
    this.lastHazardPulseId = collider.id;

    const normal = this.hitNormal;
    const surface = this.surfaceVelocity;
    const alongNormal = surface.dot(normal);
    this.scratchRadius.copy(surface).addScaledVector(normal, -alongNormal);
    const speed = this.scratchRadius.length();
    if (speed < 0.15) return;

    const transfer = collider.kind === 'hazard' ? 0.95 : 0.75;
    body.velocity.addScaledVector(this.scratchRadius, transfer);
    if (normal.y < 0.7) {
      body.velocity.y += Math.min(2.4, speed * 0.18);
      body.grounded = false;
      body.support = null;
    }
    body.landedThisStep = false;
  }

  /**
   * Find the deepest penetration between the bean's two capsules spheres and
   * any collider. Results live in `hitCollider`, `hitNormal` and `hitDepth`.
   */
  private findDeepestContact(body: BeanBody): boolean {
    this.hitCollider = null;
    this.hitDepth = 0;
    this.hitDepthStored = 0;

    const bottomCenterY = body.position.y + body.radius;
    const topCenterY = body.position.y + body.height - body.radius;

    for (const collider of this.colliders) {
      if (!collider.enabled) continue;

      this.scratchA.set(body.position.x, bottomCenterY, body.position.z);
      if (this.testSphereAgainstCollider(this.scratchA, body.radius, collider)) {
        if (this.hitDepth > this.hitDepthStored) {
          this.hitDepthStored = this.hitDepth;
          this.hitCollider = collider;
          this.hitNormalStored.copy(this.hitNormal);
          this.hitCenterStored.copy(this.scratchA);
        }
      }

      this.scratchA.set(body.position.x, topCenterY, body.position.z);
      if (this.testSphereAgainstCollider(this.scratchA, body.radius, collider)) {
        if (this.hitDepth > this.hitDepthStored) {
          this.hitDepthStored = this.hitDepth;
          this.hitCollider = collider;
          this.hitNormalStored.copy(this.hitNormal);
          this.hitCenterStored.copy(this.scratchA);
        }
      }
    }

    if (!this.hitCollider) return false;
    this.hitDepth = this.hitDepthStored;
    this.hitNormal.copy(this.hitNormalStored);
    return true;
  }

  private hitDepthStored = 0;
  private readonly hitNormalStored = new Vector3();

  private testSphereAgainstCollider(
    center: Vector3,
    sphereRadius: number,
    collider: Collider,
  ): boolean {
    if (collider.shape === 'box') {
      this.inverseQuaternion.copy(collider.quaternion).invert();
      this.localCenter
        .copy(center)
        .sub(collider.position)
        .applyQuaternion(this.inverseQuaternion);

      const hx = collider.halfExtents.x;
      const hy = collider.halfExtents.y;
      const hz = collider.halfExtents.z;
      this.localClosest.set(
        Math.max(-hx, Math.min(hx, this.localCenter.x)),
        Math.max(-hy, Math.min(hy, this.localCenter.y)),
        Math.max(-hz, Math.min(hz, this.localCenter.z)),
      );
      this.localDelta.subVectors(this.localCenter, this.localClosest);
      const distanceSq = this.localDelta.lengthSq();

      if (distanceSq > sphereRadius * sphereRadius) return false;

      if (distanceSq > 1e-10) {
        const distance = Math.sqrt(distanceSq);
        const depth = sphereRadius - distance;
        if (depth <= CONTACT_EPSILON) return false;
        this.localNormal.copy(this.localDelta).multiplyScalar(1 / distance);
        this.hitNormal.copy(this.localNormal).applyQuaternion(collider.quaternion);
        this.hitDepth = depth;
        return true;
      }

      // Sphere centre is inside the box: leave via the nearest face.
      const dx = hx - Math.abs(this.localCenter.x);
      const dy = hy - Math.abs(this.localCenter.y);
      const dz = hz - Math.abs(this.localCenter.z);
      this.localNormal.set(0, 0, 0);
      let gap = dx;
      this.localNormal.x = this.localCenter.x >= 0 ? 1 : -1;
      if (dy < gap) {
        gap = dy;
        this.localNormal.set(0, this.localCenter.y >= 0 ? 1 : -1, 0);
      }
      if (dz < gap) {
        gap = dz;
        this.localNormal.set(0, 0, this.localCenter.z >= 0 ? 1 : -1);
      }
      this.hitNormal.copy(this.localNormal).applyQuaternion(collider.quaternion);
      this.hitDepth = sphereRadius + gap;
      return true;
    }

    this.inverseQuaternion.copy(collider.quaternion).invert();
    this.localCenter
      .copy(center)
      .sub(collider.position)
      .applyQuaternion(this.inverseQuaternion);

    const halfHeight = collider.height / 2;
    const radial = Math.hypot(this.localCenter.x, this.localCenter.z);
    const insideVolume =
      radial < collider.radius && Math.abs(this.localCenter.y) < halfHeight;

    if (insideVolume) {
      const radialGap = collider.radius - radial;
      const topGap = halfHeight - this.localCenter.y;
      const bottomGap = this.localCenter.y + halfHeight;
      this.localNormal.set(0, 0, 0);
      let gap = radialGap;
      if (radial > 1e-8) {
        this.localNormal.set(this.localCenter.x / radial, 0, this.localCenter.z / radial);
      } else {
        this.localNormal.set(1, 0, 0);
      }
      if (topGap < gap) {
        gap = topGap;
        this.localNormal.set(0, 1, 0);
      }
      if (bottomGap < gap) {
        gap = bottomGap;
        this.localNormal.set(0, -1, 0);
      }
      this.hitNormal.copy(this.localNormal).applyQuaternion(collider.quaternion);
      this.hitDepth = sphereRadius + gap;
      return this.hitDepth > CONTACT_EPSILON;
    }

    const clampedRadius = Math.min(radial, collider.radius);
    const clampedY = Math.max(-halfHeight, Math.min(halfHeight, this.localCenter.y));
    const invRadial = radial > 1e-8 ? 1 / radial : 0;
    this.localClosest.set(
      this.localCenter.x * invRadial * clampedRadius,
      clampedY,
      this.localCenter.z * invRadial * clampedRadius,
    );
    this.localDelta.subVectors(this.localCenter, this.localClosest);
    const distanceSq = this.localDelta.lengthSq();
    if (distanceSq > sphereRadius * sphereRadius) return false;

    if (distanceSq > 1e-10) {
      const distance = Math.sqrt(distanceSq);
      const depth = sphereRadius - distance;
      if (depth <= CONTACT_EPSILON) return false;
      this.localNormal.copy(this.localDelta).multiplyScalar(1 / distance);
      this.hitNormal.copy(this.localNormal).applyQuaternion(collider.quaternion);
      this.hitDepth = depth;
      return true;
    }

    // Centre exactly on the cylinder surface: choose the cap that is nearest.
    this.localNormal.set(this.localCenter.x, 0, this.localCenter.z);
    if (this.localNormal.lengthSq() < 1e-8) this.localNormal.set(1, 0, 0);
    this.localNormal.normalize();
    this.hitNormal.copy(this.localNormal).applyQuaternion(collider.quaternion);
    this.hitDepth = sphereRadius;
    return true;
  }

  /**
   * Vertical-capsule vs vertical-capsule bean collision.
   *
   * The old two-sphere-pair approximation tested each cap against every other
   * cap. Two beans running shoulder to shoulder could be resolved along the
   * diagonal between one bean's foot sphere and the other's head sphere, which
   * launched the pack upward. Both physics capsules are upright with parallel
   * axes, so the closest points live on those two vertical segments; solving
   * that once gives a horizontal normal for side-by-side beans and a vertical
   * normal only when one is genuinely above the other.
   */
  private resolveBeanPairs(): void {
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i += 1) {
      const a = bodies[i];
      if (!a || a.eliminated || a.frozen) continue;
      for (let j = i + 1; j < bodies.length; j += 1) {
        const b = bodies[j];
        if (!b || b.eliminated || b.frozen) continue;

        const aMin = a.position.y + a.radius;
        const aMax = a.position.y + a.height - a.radius;
        const bMin = b.position.y + b.radius;
        const bMax = b.position.y + b.height - b.radius;

        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        let dy = 0;
        if (bMin > aMax) dy = bMin - aMax;
        else if (bMax < aMin) dy = bMax - aMin;

        const minDistance = a.radius + b.radius;
        const distanceSq = dx * dx + dy * dy + dz * dz;
        if (distanceSq >= minDistance * minDistance) continue;

        let nx: number;
        let ny: number;
        let nz: number;
        let overlap: number;
        if (distanceSq > 1e-8) {
          const distance = Math.sqrt(distanceSq);
          overlap = minDistance - distance;
          nx = dx / distance;
          ny = dy / distance;
          nz = dz / distance;
        } else {
          overlap = minDistance;
          nx = 0;
          ny = 0;
          nz = 1;
        }
        if (overlap <= CONTACT_EPSILON) continue;

        // Positional correction is split evenly; vertical separation is kept
        // small so a crowded pack reads as shoving, not as a trampoline.
        const half = overlap * 0.5;
        a.position.x -= nx * half;
        a.position.y -= ny * half * 0.35;
        a.position.z -= nz * half;
        b.position.x += nx * half;
        b.position.y += ny * half * 0.35;
        b.position.z += nz * half;

        const relative =
          (b.velocity.x - a.velocity.x) * nx +
          (b.velocity.y - a.velocity.y) * ny +
          (b.velocity.z - a.velocity.z) * nz;
        if (relative < 0) {
          const impulse = (-(1 + BEAN_BOUNCE) * relative) / 2;
          a.velocity.x -= nx * impulse;
          a.velocity.y -= ny * impulse * 0.35;
          a.velocity.z -= nz * impulse;
          b.velocity.x += nx * impulse;
          b.velocity.y += ny * impulse * 0.35;
          b.velocity.z += nz * impulse;
        }
      }
    }
  }

  private overlapsAny(center: Vector3, radius: number): boolean {
    for (const collider of this.colliders) {
      if (!collider.enabled || collider.kind === 'kill') continue;
      if (collider.shape === 'box') {
        this.inverseQuaternion.copy(collider.quaternion).invert();
        this.localCenter
          .copy(center)
          .sub(collider.position)
          .applyQuaternion(this.inverseQuaternion);
        const hx = collider.halfExtents.x;
        const hy = collider.halfExtents.y;
        const hz = collider.halfExtents.z;
        this.localClosest.set(
          Math.max(-hx, Math.min(hx, this.localCenter.x)),
          Math.max(-hy, Math.min(hy, this.localCenter.y)),
          Math.max(-hz, Math.min(hz, this.localCenter.z)),
        );
        if (this.localClosest.distanceToSquared(this.localCenter) < radius * radius) return true;
      } else {
        this.inverseQuaternion.copy(collider.quaternion).invert();
        this.localCenter
          .copy(center)
          .sub(collider.position)
          .applyQuaternion(this.inverseQuaternion);
        const halfHeight = collider.height / 2;
        const radial = Math.hypot(this.localCenter.x, this.localCenter.z);
        if (Math.abs(this.localCenter.y) > halfHeight + radius) continue;
        if (radial > collider.radius + radius) continue;
        const clampedY = Math.max(-halfHeight, Math.min(halfHeight, this.localCenter.y));
        const invRadial = radial > 1e-8 ? 1 / radial : 0;
        this.localClosest.set(
          this.localCenter.x * invRadial * Math.min(radial, collider.radius),
          clampedY,
          this.localCenter.z * invRadial * Math.min(radial, collider.radius),
        );
        if (this.localClosest.distanceToSquared(this.localCenter) < radius * radius) return true;
      }
    }
    return false;
  }
}
