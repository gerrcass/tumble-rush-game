import { Quaternion, Vector3 } from 'three';

export type ColliderKind = 'solid' | 'conveyor' | 'bounce' | 'hazard' | 'kill';
export type ColliderShape = 'box' | 'cylinder';

let nextColliderId = 1;
const scratchPosition = new Vector3();

/**
 * World collider data. Levels build these; PhysicsWorld only reads and
 * mutates their kinematic transform.
 *
 * A box is an oriented box. A cylinder is a capped cylinder aligned to its
 * local Y axis. `velocity` is the surface velocity used for conveyor belts and
 * the velocity transfer performed by moving platforms.
 */
export interface Collider {
  readonly id: string;
  readonly shape: ColliderShape;
  kind: ColliderKind;
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  readonly prevPosition: Vector3;
  readonly prevQuaternion: Quaternion;
  readonly halfExtents: Vector3;
  readonly radius: number;
  readonly height: number;
  readonly velocity: Vector3;
  /** World-space angular velocity (rad/s). Rotating sweepers and beams use it. */
  readonly angularVelocity: Vector3;
  bounceStrength: number;
  enabled: boolean;
}

export interface BoxColliderOptions {
  kind?: ColliderKind;
  halfExtents: Vector3;
  position: Vector3;
  quaternion?: Quaternion;
  velocity?: Vector3;
  angularVelocity?: Vector3;
  bounceStrength?: number;
}

export interface CylinderColliderOptions {
  kind?: ColliderKind;
  radius: number;
  height: number;
  position: Vector3;
  quaternion?: Quaternion;
  velocity?: Vector3;
  angularVelocity?: Vector3;
  bounceStrength?: number;
}

export function createBoxCollider(options: BoxColliderOptions): Collider {
  return {
    id: `collider-${nextColliderId++}`,
    shape: 'box',
    kind: options.kind ?? 'solid',
    position: options.position.clone(),
    quaternion: (options.quaternion ?? new Quaternion()).clone(),
    prevPosition: options.position.clone(),
    prevQuaternion: (options.quaternion ?? new Quaternion()).clone(),
    halfExtents: options.halfExtents.clone(),
    radius: 0,
    height: 0,
    velocity: (options.velocity ?? new Vector3()).clone(),
    angularVelocity: (options.angularVelocity ?? new Vector3()).clone(),
    bounceStrength: options.bounceStrength ?? 0,
    enabled: true,
  };
}

export function createCylinderCollider(options: CylinderColliderOptions): Collider {
  return {
    id: `collider-${nextColliderId++}`,
    shape: 'cylinder',
    kind: options.kind ?? 'solid',
    position: options.position.clone(),
    quaternion: (options.quaternion ?? new Quaternion()).clone(),
    prevPosition: options.position.clone(),
    prevQuaternion: (options.quaternion ?? new Quaternion()).clone(),
    halfExtents: new Vector3(options.radius, options.height / 2, options.radius),
    radius: options.radius,
    height: options.height,
    velocity: (options.velocity ?? new Vector3()).clone(),
    angularVelocity: (options.angularVelocity ?? new Vector3()).clone(),
    bounceStrength: options.bounceStrength ?? 0,
    enabled: true,
  };
}

/** Move a kinematic collider and record the delta used for platform carry. */
export function moveCollider(
  collider: Collider,
  x: number,
  y: number,
  z: number,
  dt: number,
): void {
  setColliderTransform(collider, scratchPosition.set(x, y, z), collider.quaternion, dt);
}

/**
 * Set a kinematic collider's full transform for this fixed step and derive its
 * linear surface velocity from the delta. The Level steps hazards before the
 * physics world runs, so the world sees prev→current for the same step.
 */
export function setColliderTransform(
  collider: Collider,
  position: Vector3,
  quaternion: Quaternion,
  dt: number,
): void {
  collider.prevPosition.copy(collider.position);
  collider.prevQuaternion.copy(collider.quaternion);
  collider.position.copy(position);
  collider.quaternion.copy(quaternion);
  if (dt > 0) {
    collider.velocity.set(
      (collider.position.x - collider.prevPosition.x) / dt,
      (collider.position.y - collider.prevPosition.y) / dt,
      (collider.position.z - collider.prevPosition.z) / dt,
    );
  }
}

/** Reset a kinematic collider without producing a velocity spike. */
export function snapCollider(
  collider: Collider,
  position: Vector3,
  quaternion: Quaternion = collider.quaternion,
): void {
  collider.position.copy(position);
  collider.prevPosition.copy(position);
  collider.quaternion.copy(quaternion);
  collider.prevQuaternion.copy(quaternion);
  collider.velocity.set(0, 0, 0);
  collider.angularVelocity.set(0, 0, 0);
}
