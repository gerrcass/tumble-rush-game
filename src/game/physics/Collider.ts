import { Quaternion, Vector3 } from 'three';

export type ColliderKind = 'solid' | 'conveyor' | 'bounce' | 'hazard' | 'kill';
export type ColliderShape = 'box' | 'cylinder';

let nextColliderId = 1;

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
  bounceStrength: number;
  enabled: boolean;
}

export interface BoxColliderOptions {
  kind?: ColliderKind;
  halfExtents: Vector3;
  position: Vector3;
  quaternion?: Quaternion;
  velocity?: Vector3;
  bounceStrength?: number;
}

export interface CylinderColliderOptions {
  kind?: ColliderKind;
  radius: number;
  height: number;
  position: Vector3;
  quaternion?: Quaternion;
  velocity?: Vector3;
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
  collider.prevPosition.copy(collider.position);
  collider.position.set(x, y, z);
  if (dt > 0) {
    collider.velocity.set(
      (collider.position.x - collider.prevPosition.x) / dt,
      (collider.position.y - collider.prevPosition.y) / dt,
      (collider.position.z - collider.prevPosition.z) / dt,
    );
  }
}
