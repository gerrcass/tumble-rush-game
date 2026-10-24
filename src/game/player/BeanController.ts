import { Vector3 } from 'three';
import type { BeanBody } from '../physics/BeanBody';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

export type BeanMotionState = 'idle' | 'run' | 'air' | 'dive' | 'stumble' | 'grab' | 'emote';

export interface ControllerFrame {
  /** Rightward input, -1..1. */
  moveX: number;
  /** Forward input, -1..1. */
  moveZ: number;
  cameraYaw: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  divePressed: boolean;
  grabPressed: boolean;
  grabHeld: boolean;
  emotePressed: boolean;
}

export type ControllerEventType =
  | 'jump'
  | 'land'
  | 'dive'
  | 'grab'
  | 'shove'
  | 'emote'
  | 'stumble';

export interface ControllerEvent {
  type: ControllerEventType;
  strength: number;
}

export const MAX_RUN_SPEED = 8;
const GROUND_ACCEL = 55;
const AIR_CONTROL = 0.65;
const GROUND_FRICTION = 14;
const AIR_DRAG = 1.2;
const JUMP_VELOCITY = 8.6;
const COYOTE_TIME = 0.12;
const JUMP_BUFFER = 0.12;
const DIVE_TIME = 0.45;
const DIVE_COOLDOWN = 1.1;
const DIVE_IMPULSE = 8;
const DIVE_HIT_RANGE = 1.4;
const GRAB_RANGE = 1.2;
const GRAB_MAX_HOLD = 0.9;
const EMOTE_TIME = 1.4;
const STUMBLE_TIME = 0.5;
const STUMBLE_THRESHOLD = 11.5;

/**
 * Bean movement controller.
 *
 * Run, jump (coyote time + input buffer), dive, grab/shove and emote. There is
 * deliberately no sprint and no double jump. All action state is stepped at the
 * fixed rate; rendering only reads the resulting motion state.
 *
 * Physics owns integration and contact response. This controller only shapes
 * intent: acceleration, jump impulses, dive commitment and presentation state.
 */
export class BeanController {
  readonly body: BeanBody;
  private readonly world: PhysicsWorld;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private diveTimer = 0;
  diveCooldown = 0;
  private grabTimer = 0;
  private stumbleTimer = 0;
  private emoteTimer = 0;
  landTimer = 0;
  airTime = 0;
  grabbed: BeanBody | null = null;
  onEvent: ((event: ControllerEvent) => void) | null = null;

  private readonly wish = new Vector3();
  private readonly diveDirection = new Vector3(0, 0, -1);
  private readonly scratch = new Vector3();
  private lastStumbleAt = -10;
  private elapsed = 0;

  constructor(body: BeanBody, world: PhysicsWorld) {
    this.body = body;
    this.world = world;
  }

  get motionState(): BeanMotionState {
    if (this.diveTimer > 0) return 'dive';
    if (this.stumbleTimer > 0) return 'stumble';
    if (this.grabbed) return 'grab';
    if (this.emoteTimer > 0) return 'emote';
    if (!this.body.grounded) return 'air';
    const horizontalSpeed = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    return horizontalSpeed > 0.7 ? 'run' : 'idle';
  }

  get jumpBuffer(): number {
    return this.jumpBufferTimer;
  }

  get coyote(): number {
    return this.coyoteTimer;
  }

  update(dt: number, frame: ControllerFrame): void {
    this.elapsed += dt;
    if (this.body.eliminated) return;
    this.vehicleYaw = frame.cameraYaw;

    this.landTimer = Math.max(0, this.landTimer - dt);
    this.diveCooldown = Math.max(0, this.diveCooldown - dt);
    this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);
    this.emoteTimer = Math.max(0, this.emoteTimer - dt);

    if (this.body.grounded) {
      this.coyoteTimer = COYOTE_TIME;
      this.airTime = 0;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
      this.airTime += dt;
    }

    if (frame.jumpPressed) this.jumpBufferTimer = JUMP_BUFFER;
    else this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);

    this.readWish(frame);

    if (this.grabbed) {
      this.updateGrab(dt, frame);
      if (this.grabbed) {
        return;
      }
    } else if (frame.grabPressed) {
      this.tryGrab();
    }

    if (this.emoteTimer === 0 && frame.emotePressed) {
      this.emoteTimer = EMOTE_TIME;
      this.emit('emote', 1);
    }

    if (this.tryJump()) {
      // Jumping this step overrides ground acceleration, but horizontal input
      // still applies so a running jump keeps its momentum.
    }

    if (this.diveTimer > 0) {
      this.diveTimer = Math.max(0, this.diveTimer - dt);
      this.body.velocity.x = this.diveDirection.x * DIVE_IMPULSE;
      this.body.velocity.z = this.diveDirection.z * DIVE_IMPULSE;
      if (this.diveTimer === 0) this.body.velocity.y = Math.min(this.body.velocity.y, -1);
      return;
    }

    if (frame.divePressed && this.diveCooldown <= 0 && this.body.grounded) {
      this.startDive();
      return;
    }
    if (frame.divePressed && this.diveCooldown <= 0 && !this.body.grounded) {
      this.startDive();
      return;
    }

    this.applyMovement(dt);
  }

  /** Called when a collision is hard enough to be a stumble (not a landing). */
  notifyImpact(strength: number): void {
    if (strength < STUMBLE_THRESHOLD) return;
    if (this.elapsed - this.lastStumbleAt < 0.9) return;
    this.lastStumbleAt = this.elapsed;
    this.stumbleTimer = STUMBLE_TIME;
    this.emit('stumble', strength);
  }

  reset(): void {
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.diveTimer = 0;
    this.diveCooldown = 0;
    this.grabTimer = 0;
    this.stumbleTimer = 0;
    this.emoteTimer = 0;
    this.landTimer = 0;
    this.airTime = 0;
    this.grabbed = null;
    this.lastStumbleAt = -10;
  }

  private readWish(frame: ControllerFrame): void {
    let x = frame.moveX;
    let z = frame.moveZ;
    const length = Math.hypot(x, z);
    if (length > 1) {
      x /= length;
      z /= length;
    }

    // Camera-relative basis. The camera looks toward -Z at yaw 0.
    const forwardX = -Math.sin(frame.cameraYaw);
    const forwardZ = -Math.cos(frame.cameraYaw);
    const rightX = Math.cos(frame.cameraYaw);
    const rightZ = -Math.sin(frame.cameraYaw);
    this.wish.set(
      rightX * x + forwardX * z,
      0,
      rightZ * x + forwardZ * z,
    );
    if (this.wish.lengthSq() > 1) this.wish.normalize();
  }

  private tryJump(): boolean {
    if (this.jumpBufferTimer <= 0 || this.diveTimer > 0) return false;
    if (!this.body.grounded && this.coyoteTimer <= 0) return false;

    // A grounded bean inherits the surface's horizontal velocity. This is a
    // transfer, not an extra jump: it never increases the maximum speed for
    // more than the platform is already moving.
    if (this.body.support) {
      this.body.velocity.x += this.body.support.velocity.x * 0.85;
      this.body.velocity.z += this.body.support.velocity.z * 0.85;
    }
    this.body.velocity.y = JUMP_VELOCITY;
    this.body.grounded = false;
    this.body.support = null;
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.emit('jump', JUMP_VELOCITY);
    return true;
  }

  private startDive(): void {
    const direction = this.scratch;
    if (this.wish.lengthSq() > 0.01) {
      direction.copy(this.wish).normalize();
    } else {
      direction.set(-Math.sin(this.vehicleYaw), 0, -Math.cos(this.vehicleYaw));
    }
    this.diveDirection.copy(direction);
    this.body.velocity.x = direction.x * DIVE_IMPULSE;
    this.body.velocity.z = direction.z * DIVE_IMPULSE;
    this.body.velocity.y = Math.min(this.body.velocity.y, 0) - 2.2;
    this.diveTimer = DIVE_TIME;
    this.diveCooldown = DIVE_COOLDOWN;
    this.emit('dive', DIVE_IMPULSE);

    for (const other of this.world.bodies) {
      if (other === this.body || other.eliminated) continue;
      const dx = other.position.x - this.body.position.x;
      const dz = other.position.z - this.body.position.z;
      if (dx * dx + dz * dz < DIVE_HIT_RANGE * DIVE_HIT_RANGE) {
        this.world.applyShove(this.body, other, 7.5);
      }
    }
  }

  private vehicleYaw = 0;

  private applyMovement(dt: number): void {
    const stumbleScale = this.stumbleTimer > 0 ? 0.42 : 1;
    const emoteScale = this.emoteTimer > 0 ? 0.62 : 1;
    const targetSpeed = MAX_RUN_SPEED * stumbleScale * emoteScale;
    const surfaceX =
      this.body.grounded && this.body.support?.kind === 'conveyor'
        ? this.body.support.velocity.x
        : 0;
    const surfaceZ =
      this.body.grounded && this.body.support?.kind === 'conveyor'
        ? this.body.support.velocity.z
        : 0;

    let targetX = 0;
    let targetZ = 0;
    const hasInput = this.wish.lengthSq() > 0.0004;
    if (hasInput) {
      targetX = this.wish.x * targetSpeed + surfaceX;
      targetZ = this.wish.z * targetSpeed + surfaceZ;
    } else {
      // Ground friction relative to the surface: a bean standing still on a
      // conveyor is carried along with it, but on a moving platform positional
      // carry (PhysicsWorld) keeps it planted without adding drift velocity.
      targetX = surfaceX;
      targetZ = surfaceZ;
    }

    const accel = this.body.grounded ? GROUND_ACCEL : GROUND_ACCEL * AIR_CONTROL;
    const friction = this.body.grounded ? GROUND_FRICTION : AIR_DRAG;
    const rate = hasInput ? accel : friction;

    this.body.velocity.x = moveToward(this.body.velocity.x, targetX, rate * dt);
    this.body.velocity.z = moveToward(this.body.velocity.z, targetZ, rate * dt);
  }

  private tryGrab(): void {
    let best: BeanBody | null = null;
    let bestDistance = GRAB_RANGE * GRAB_RANGE;
    for (const other of this.world.bodies) {
      if (other === this.body || other.eliminated) continue;
      const dx = other.position.x - this.body.position.x;
      const dy = other.position.y - this.body.position.y;
      const dz = other.position.z - this.body.position.z;
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = other;
      }
    }
    if (!best) {
      this.emit('grab', 0);
      return;
    }
    this.grabbed = best;
    this.grabTimer = 0;
    this.emit('grab', 1);
  }

  private updateGrab(dt: number, frame: ControllerFrame): void {
    const other = this.grabbed;
    if (!other || other.eliminated) {
      this.grabbed = null;
      return;
    }
    this.grabTimer += dt;
    const dx = other.position.x - this.body.position.x;
    const dz = other.position.z - this.body.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > GRAB_RANGE * 1.35) {
      this.grabbed = null;
      return;
    }

    // Both beans slow while held, and the held bean is nudged toward the
    // holder so the pair reads as a scuffle rather than a stiff attachment.
    this.body.velocity.x *= 0.86;
    this.body.velocity.z *= 0.86;
    if (distance > 0.75) {
      const pull = 5 * dt;
      other.velocity.x -= (dx / distance) * pull;
      other.velocity.z -= (dz / distance) * pull;
    }

    if (!frame.grabHeld || this.grabTimer >= GRAB_MAX_HOLD) {
      if (!frame.grabHeld && this.grabTimer < GRAB_MAX_HOLD) {
        this.world.applyShove(this.body, other, 9.5);
        this.emit('shove', 9.5);
      }
      this.grabbed = null;
    }
  }

  notifyLand(impact: number): void {
    this.landTimer = 0.22;
    this.emit('land', impact);
    if (impact >= 15) {
      this.stumbleTimer = STUMBLE_TIME;
      this.emit('stumble', impact);
    }
  }

  private emit(type: ControllerEventType, strength: number): void {
    this.onEvent?.({ type, strength });
  }

  setCameraYaw(yaw: number): void {
    this.vehicleYaw = yaw;
  }
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
