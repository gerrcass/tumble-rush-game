import { PerspectiveCamera, Vector3 } from 'three';
import type { BeanBody } from '../physics/BeanBody';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { clamp, damp, dampAngle } from '../util/math';

export interface ViewInput {
  orbitX: number;
  orbitY: number;
  zoom: number;
}

export interface CameraContext {
  menu: boolean;
  celebrating: boolean;
  reducedMotion: boolean;
}

const BASE_FOV = 68;
const SPEED_FOV = 6;
const MIN_PITCH = (-5 * Math.PI) / 180;
const MAX_PITCH = (65 * Math.PI) / 180;
const MIN_DISTANCE = 3.5;
const MAX_DISTANCE = 8;

/**
 * Third-person follow camera.
 *
 * The rig keeps its own smoothed pivot and position, orbits on drag, zooms on
 * wheel, leads the bean's velocity, kicks the FOV at speed, and sphere-casts
 * against the physics world so it never settles inside a platform or wall. In
 * menu mode it drifts in a slow establishing orbit; on the finish it performs
 * a hero orbit.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  private readonly world: PhysicsWorld;

  yaw = 0;
  pitch = (26 * Math.PI) / 180;
  distance = 5.2;

  /** Lowest camera height for the current Round (set by Game from the Level). */
  floorY = 0.55;

  private readonly smoothPivot = new Vector3(0, 1.1, 0);
  private readonly smoothPosition = new Vector3();
  private readonly smoothLook = new Vector3();
  private readonly target = new Vector3();
  private readonly lookAhead = new Vector3();
  private readonly desired = new Vector3();
  private readonly offset = new Vector3();
  private readonly shakeOffset = new Vector3();
  private readonly shoulder = new Vector3();
  private debugLook: Vector3 | null = null;
  private debugLookActive = false;

  private shake = 0;
  private elapsed = 0;
  private timeSinceOrbit = 99;
  private initialized = false;
  private menuOrbit = 0;

  constructor(camera: PerspectiveCamera, world: PhysicsWorld) {
    this.camera = camera;
    this.world = world;
  }

  /** Establish the front-right menu view of the idle bean. */
  snapMenu(body: BeanBody): void {
    this.yaw = 0.38;
    this.pitch = (21 * Math.PI) / 180;
    this.distance = 6.4;
    this.menuOrbit = 0;
    this.pivotFor(body, this.smoothPivot);
    this.desiredFrom(this.smoothPivot, this.smoothPosition);
    this.applyCollision(this.smoothPivot, this.smoothPosition, this.smoothPosition);
    this.smoothLook.copy(this.smoothPivot);
    this.initialized = true;
    this.camera.position.copy(this.smoothPosition);
    this.camera.lookAt(this.smoothLook);
  }

  /** Snap behind the bean. Used when entering gameplay from the menu. */
  snapBehind(body: BeanBody): void {
    this.yaw = 0;
    this.pitch = (26 * Math.PI) / 180;
    this.distance = 5.2;
    this.timeSinceOrbit = 99;
    this.pivotFor(body, this.smoothPivot);
    this.desiredFrom(this.smoothPivot, this.smoothPosition);
    this.smoothLook.copy(this.smoothPivot);
    this.initialized = true;
    this.camera.position.copy(this.smoothPosition);
    this.camera.lookAt(this.smoothLook);
  }

  addShake(amount: number): void {
    this.shake = Math.min(0.5, this.shake + amount);
  }

  /** Kept above the Round's danger surface; Crown Climb moves this with slime. */
  setFloor(y: number): void {
    this.floorY = y;
  }

  /** Debug/evidence framing hook. Distances past the wheel clamp are allowed. */
  setCamera(yaw: number, pitch: number, distance: number): void {
    this.yaw = yaw;
    this.pitch = clamp(pitch, MIN_PITCH, MAX_PITCH);
    this.distance = Math.max(1.4, Math.min(distance, 70));
    this.timeSinceOrbit = 0;
  }

  /** Debug/evidence framing hook: override the look target until cleared. */
  lookAt(x: number, y: number, z: number): void {
    if (!this.debugLook) {
      this.debugLook = new Vector3(x, y, z);
    } else {
      this.debugLook.set(x, y, z);
    }
    this.debugLookActive = true;
  }

  clearLookAt(): void {
    this.debugLookActive = false;
  }

  update(
    dt: number,
    body: BeanBody,
    view: ViewInput,
    context: CameraContext,
    cameraTime: number,
  ): void {
    this.elapsed = cameraTime;
    if (!this.initialized) {
      this.pivotFor(body, this.smoothPivot);
      this.smoothLook.copy(this.smoothPivot);
      this.smoothPosition.copy(this.smoothPivot).add(new Vector3(0, 2, 6));
      this.initialized = true;
    }

    if (view.orbitX !== 0 || view.orbitY !== 0) {
      this.yaw -= view.orbitX * 0.0045;
      this.pitch = clamp(this.pitch + view.orbitY * 0.0035, MIN_PITCH, MAX_PITCH);
      this.timeSinceOrbit = 0;
    } else {
      this.timeSinceOrbit += dt;
    }
    if (view.zoom !== 0) {
      this.distance = clamp(this.distance + view.zoom * 0.0032, MIN_DISTANCE, MAX_DISTANCE);
    }

    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    const speedRatio = clamp(speed / 8, 0, 1);

    if (context.menu) {
      this.menuOrbit += dt;
      this.yaw = damp(
        this.yaw,
        0.38 + Math.sin(this.menuOrbit * 0.22) * 0.12,
        2.2,
        dt,
      );
      this.pitch = (21 * Math.PI) / 180;
      this.distance = damp(this.distance, 6.4, 2.2, dt);
      this.pivotFor(body, this.target);
      this.smoothPivot.lerp(this.target, 1 - Math.exp(-7 * dt));
      this.smoothLook.lerp(this.target, 1 - Math.exp(-9 * dt));
      this.desiredFrom(this.smoothPivot, this.desired);
      this.applyCollision(this.smoothPivot, this.desired, this.desired);
      this.smoothPosition.lerp(this.desired, 1 - Math.exp(-8 * dt));
      this.camera.position.copy(this.smoothPosition);
      this.camera.lookAt(this.lookPoint());
      this.camera.fov = damp(this.camera.fov, BASE_FOV, 5, dt);
      this.camera.updateProjectionMatrix();
      return;
    }

    if (context.celebrating) {
      this.yaw += dt * 0.32;
      this.pitch = (22 * Math.PI) / 180;
      this.distance = damp(this.distance, 6.8, 2.5, dt);
    } else if (speed > 1.2 && this.timeSinceOrbit > 0.8) {
      const travelYaw = Math.atan2(-body.velocity.x, -body.velocity.z);
      this.yaw = dampAngle(this.yaw, travelYaw, 1.6, dt);
    }

    this.pivotFor(body, this.target);
    if (!context.celebrating) {
      this.lookAhead.copy(body.velocity).multiplyScalar(0.16);
      this.lookAhead.y = 0;
      if (this.lookAhead.lengthSq() > 1.44) this.lookAhead.setLength(1.2);
      this.target.add(this.lookAhead);
    }
    this.smoothPivot.lerp(this.target, 1 - Math.exp(-10 * dt));

    this.desiredFrom(this.smoothPivot, this.desired);
    this.applyCollision(this.smoothPivot, this.desired, this.desired);

    if (context.celebrating) {
      this.smoothPosition.lerp(this.desired, 1 - Math.exp(-7 * dt));
    } else {
      this.smoothPosition.lerp(this.desired, 1 - Math.exp(-11 * dt));
      // Re-check the smoothed position so lag cannot place the camera inside a wall.
      this.applyCollision(this.smoothPivot, this.smoothPosition, this.smoothPosition);
    }

    this.smoothLook.lerp(this.target, 1 - Math.exp(-13 * dt));

    this.shake = Math.max(0, this.shake - dt * 2.6);
    const shakeAmount = context.reducedMotion ? 0 : this.shake;
    this.shakeOffset.set(
      Math.sin(this.elapsed * 91) * shakeAmount,
      Math.cos(this.elapsed * 73) * shakeAmount * 0.7,
      Math.sin(this.elapsed * 57) * shakeAmount,
    );

    this.camera.position.copy(this.smoothPosition).add(this.shakeOffset);
    this.camera.lookAt(this.lookPoint());

    const targetFov = BASE_FOV + speedRatio * SPEED_FOV + (context.celebrating ? 3 : 0);
    this.camera.fov = damp(this.camera.fov, targetFov, 6, dt);
    this.camera.updateProjectionMatrix();
  }

  private pivotFor(body: BeanBody, out: Vector3): void {
    out.set(body.position.x, body.position.y + 1.12, body.position.z);
  }

  private desiredFrom(pivot: Vector3, out: Vector3): void {
    const cosPitch = Math.cos(this.pitch);
    this.offset.set(
      Math.sin(this.yaw) * cosPitch * this.distance,
      Math.sin(this.pitch) * this.distance + 0.35,
      Math.cos(this.yaw) * cosPitch * this.distance,
    );
    out.copy(pivot).add(this.offset);
  }

  private lookPoint(): Vector3 {
    return this.debugLookActive && this.debugLook ? this.debugLook : this.smoothLook;
  }

  private applyCollision(from: Vector3, desired: Vector3, out: Vector3): void {
    const radius = 0.3;
    const fraction = this.world.sweepCamera(from, desired, radius);
    out.lerpVectors(from, desired, fraction);

    // Sphere-cast samples can still finish a hair inside a thin barrier; walk
    // back toward the pivot until the final camera point is provably clear.
    for (let i = 0; i < 10 && this.world.pointBlocked(out, radius); i += 1) {
      out.lerpVectors(from, out, 0.7);
    }

    if (this.world.pointBlocked(out, radius)) {
      // Fully enclosed (under a low deck): rise to a safe shoulder shot.
      out.copy(from).add(this.shoulder.set(0, 1.15, 0.4));
    }

    // Sane minimum distance: never sit inside the Tumbler's silhouette.
    const horizontal = Math.hypot(out.x - from.x, out.z - from.z);
    if (horizontal < 1.2) {
      this.desired.copy(desired).sub(from);
      this.desired.y = Math.max(this.desired.y, 0.4);
      this.desired.normalize().multiplyScalar(1.25);
      this.desired.add(from);
      if (!this.world.pointBlocked(this.desired, radius)) out.copy(this.desired);
    }

    if (out.y < this.floorY) out.y = this.floorY;
    // The floor clamp itself can push the camera into a slab's underside; if
    // so, lift it just clear rather than accepting the clip.
    for (let i = 0; i < 4 && this.world.pointBlocked(out, radius); i += 1) {
      out.y += 0.35;
    }
  }
}
