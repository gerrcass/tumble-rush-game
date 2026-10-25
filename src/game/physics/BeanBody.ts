import { Vector3 } from 'three';
import type { Collider } from './Collider';

export const BEAN_RADIUS = 0.42;
export const BEAN_HEIGHT = 1.5;

export interface BeanBodyOptions {
  position?: Vector3;
  radius?: number;
  height?: number;
}

/**
 * A dynamic bean capsule.
 *
 * `position` is the bottom of the capsule (the feet), not its centre. Two
 * collision spheres sit at `position.y + radius` and
 * `position.y + height - radius`. The visual bean is parented to this position.
 */
export class BeanBody {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  radius = BEAN_RADIUS;
  height = BEAN_HEIGHT;

  grounded = false;
  support: Collider | null = null;
  wasGrounded = false;
  landedThisStep = false;
  lastImpactSpeed = 0;
  eliminated = false;
  /** Pinned by the Show Director after a finish: physics stops moving it. */
  frozen = false;

  constructor(options: BeanBodyOptions = {}) {
    if (options.position) this.position.copy(options.position);
    if (options.radius !== undefined) this.radius = options.radius;
    if (options.height !== undefined) this.height = options.height;
  }

  reset(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.wasGrounded = false;
    this.support = null;
    this.landedThisStep = false;
    this.lastImpactSpeed = 0;
    this.eliminated = false;
    this.frozen = false;
  }
}
