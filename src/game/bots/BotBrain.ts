import { Vector3 } from 'three';
import type { BeanBody } from '../physics/BeanBody';
import type { ControllerFrame } from '../player/BeanController';
import type { Level, LevelTile, Waypoint } from '../levels/Level';
import type { Collider } from '../physics/Collider';
import type { Contestant } from '../match/Contestant';
import { Rng } from '../Rng';
import { clamp } from '../util/math';

export interface BotContext {
  level: Level;
  body: BeanBody;
  contestants: readonly Contestant[];
  leaderProgress: number;
  dt: number;
}

const IDLE_FRAME: ControllerFrame = {
  moveX: 0,
  moveZ: 0,
  cameraYaw: 0,
  jumpPressed: false,
  jumpHeld: false,
  divePressed: false,
  grabPressed: false,
  grabHeld: false,
  emotePressed: false,
};

/**
 * Bot brains only fill a ControllerFrame. They never write to a body and never
 * bypass BeanController, so every jump, dive and shove is the same one the
 * player can perform.
 */
export abstract class BotBrain {
  protected readonly owner: Contestant;
  protected readonly rng: Rng;
  protected readonly frame: ControllerFrame = { ...IDLE_FRAME };
  protected elapsed = 0;
  protected decisionTimer = 0;
  protected staleTimer = 0;
  protected hesitation = 0;
  protected lastProgress = 0;
  protected diveLock = false;
  protected shoveCooldown = 0;
  protected stuckTime = 0;
  protected recoverCooldown = 0;
  private probeTimer = 0;
  private lastProbeX = 0;
  private lastProbeZ = 0;

  constructor(owner: Contestant, seed: number, salt: number) {
    this.owner = owner;
    this.rng = new Rng((seed ^ (salt * 0x9e3779b1) ^ (owner.id * 0x85ebca6b)) >>> 0);
  }

  reset(): void {
    this.elapsed = 0;
    this.decisionTimer = 0;
    this.staleTimer = 0;
    this.hesitation = 0;
    this.lastProgress = 0;
    this.diveLock = false;
    this.shoveCooldown = 0;
    this.stuckTime = 0;
    this.recoverCooldown = 0;
    this.probeTimer = 0;
    this.lastProbeX = this.owner.body.position.x;
    this.lastProbeZ = this.owner.body.position.z;
  }

  abstract think(context: BotContext): ControllerFrame;

  protected baseFrame(): ControllerFrame {
    const frame = this.frame;
    frame.moveX = 0;
    frame.moveZ = 0;
    frame.jumpPressed = false;
    frame.jumpHeld = false;
    frame.divePressed = false;
    frame.grabPressed = false;
    frame.grabHeld = false;
    frame.emotePressed = false;
    return frame;
  }

  /** Aim the controller's camera basis at a world direction and move forward. */
  protected steer(dx: number, dz: number, speed: number): void {
    const length = Math.hypot(dx, dz);
    if (length < 0.0001) {
      this.frame.moveZ = 0;
      return;
    }
    this.frame.cameraYaw = Math.atan2(-dx, -dz);
    this.frame.moveX = 0;
    this.frame.moveZ = clamp(speed, 0, 1);
  }

  /** ±8% pacing from distance to the leader, never above the player's cap. */
  protected courseSpeed(base: number, context: BotContext): number {
    const pace = coursePace(this.owner.progress, context.leaderProgress);
    return clamp(base * pace, 0, 1);
  }

  protected maybeShoveNeighbour(context: BotContext): boolean {
    if (this.shoveCooldown > 0) return false;
    if (this.owner.aggression < 0.35) return false;
    for (const other of context.contestants) {
      if (other === this.owner || other.body.eliminated || other.status === 'eliminated') continue;
      const dx = other.body.position.x - context.body.position.x;
      const dz = other.body.position.z - context.body.position.z;
      const dy = other.body.position.y - context.body.position.y;
      if (Math.abs(dy) > 1.4) continue;
      if (dx * dx + dz * dz > 1.9 * 1.9) continue;
      if (!this.rng.chance(this.owner.aggression * 0.012)) continue;
      this.shoveCooldown = this.rng.float(1.6, 3.4);
      this.frame.divePressed = true;
      return true;
    }
    return false;
  }

  protected updateCommon(context: BotContext): void {
    this.elapsed += context.dt;
    this.decisionTimer = Math.max(0, this.decisionTimer - context.dt);
    this.hesitation = Math.max(0, this.hesitation - context.dt);
    this.shoveCooldown = Math.max(0, this.shoveCooldown - context.dt);
    this.recoverCooldown = Math.max(0, this.recoverCooldown - context.dt);
    if (context.body.grounded && Math.hypot(context.body.velocity.x, context.body.velocity.z) < 0.6) {
      this.staleTimer += context.dt;
    } else {
      this.staleTimer = Math.max(0, this.staleTimer - context.dt * 2);
    }

    // Velocity is a liar when a bean is running into a hurdle: it keeps
    // pointing into the wall. Sample actual displacement instead, so a bot
    // that is physically stuck hops rather than pushing forever.
    this.probeTimer += context.dt;
    if (this.probeTimer >= 0.32) {
      const moved = Math.hypot(
        context.body.position.x - this.lastProbeX,
        context.body.position.z - this.lastProbeZ,
      );
      if (context.body.grounded && moved < 0.16) this.stuckTime += this.probeTimer;
      else this.stuckTime = Math.max(0, this.stuckTime - this.probeTimer * 2);
      this.probeTimer = 0;
      this.lastProbeX = context.body.position.x;
      this.lastProbeZ = context.body.position.z;
    }
  }
}

/**
 * Is there a walkable collider at a point? Bots use this to see the edge of a
 * platform, which is the one piece of Course geometry a waypoint list cannot
 * describe once platforms move. No mutation, no physics step, no cheating.
 */
export function hasGroundAt(level: Level, x: number, y: number, z: number): boolean {
  for (const collider of level.colliders) {
    if (!collider.enabled || collider.kind === 'kill' || collider.kind === 'hazard') continue;
    if (containsXZ(collider, x, y, z)) return true;
  }
  return false;
}

function containsXZ(collider: Collider, x: number, y: number, z: number): boolean {
  const dx = x - collider.position.x;
  const dy = y - collider.position.y;
  const dz = z - collider.position.z;
  const { x: qx, y: qy, z: qz, w } = collider.quaternion;
  // Inverse-rotate the offset by the collider quaternion.
  const ix = -qx;
  const iy = -qy;
  const iz = -qz;
  const tx = 2 * (iy * dz - iz * dy);
  const ty = 2 * (iz * dx - ix * dz);
  const tz = 2 * (ix * dy - iy * dx);
  const localX = dx + w * tx + (iy * tz - iz * ty);
  const localY = dy + w * ty + (iz * tx - ix * tz);
  const localZ = dz + w * tz + (ix * ty - iy * tx);
  if (collider.shape === 'box') {
    return (
      Math.abs(localX) <= collider.halfExtents.x &&
      Math.abs(localY) <= collider.halfExtents.y &&
      Math.abs(localZ) <= collider.halfExtents.z
    );
  }
  if (Math.abs(localY) > collider.height / 2) return false;
  return Math.hypot(localX, localZ) <= collider.radius;
}

/**
 * The x centre of the solid surface nearest a waypoint. This is how bots aim
 * at a sliding platform instead of the place it was authored.
 */
export function landingCenterX(
  level: Level,
  target: Vector3,
  currentX: number,
): number | null {
  let best: number | null = null;
  let bestScore = Infinity;
  for (const collider of level.colliders) {
    if (!collider.enabled || collider.kind !== 'solid') continue;
    if (Math.abs(collider.position.z - target.z) > 2.8) continue;
    if (Math.abs(collider.position.y - (target.y - 0.45)) > 1.2) continue;
    if (collider.shape === 'box') {
      if (Math.abs(target.x - collider.position.x) > collider.halfExtents.x + 1.6) continue;
    } else if (Math.abs(target.x - collider.position.x) > collider.radius + 1.2) {
      continue;
    }
    const score = Math.abs(collider.position.x - currentX) + Math.abs(collider.position.z - target.z);
    if (score < bestScore) {
      bestScore = score;
      best = collider.position.x;
    }
  }
  return best;
}

/** True when a posted hazard collider is close enough to warrant a hop. */
export function hazardWithin(level: Level, body: BeanBody, radius: number): boolean {
  for (const collider of level.colliders) {
    if (!collider.enabled || collider.kind !== 'hazard') continue;
    const dx = collider.position.x - body.position.x;
    const dz = collider.position.z - body.position.z;
    const dy = collider.position.y - body.position.y;
    if (Math.abs(dy) > 2.6) continue;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

/** A pure pacing function: behind speeds up, ahead eases off. */
export function coursePace(botProgress: number, leaderProgress: number): number {
  return clamp(1 + (leaderProgress - botProgress) * 1.4, 0.92, 1.08);
}

/**
 * Pick the next Course waypoint. A waypoint counts as reached when the bean is
 * inside its acceptance radius, or as passed once it is clearly behind the
 * route. Returning an index keeps the function pure and testable.
 */
export function selectCourseWaypoint(
  waypoints: readonly Waypoint[],
  position: Vector3,
  current: number,
): number {
  let index = clamp(Math.floor(current), 0, Math.max(0, waypoints.length - 1));
  for (let guard = 0; guard < 4 && index < waypoints.length; guard += 1) {
    const waypoint = waypoints[index];
    if (!waypoint) break;
    const dx = waypoint.position.x - position.x;
    const dz = waypoint.position.z - position.z;
    const planDistance = Math.hypot(dx, dz);
    const passed = dz > 0 && waypoint.position.z > position.z + 1.8;
    const acceptance = waypoint.action === 'jump' ? 0.9 : waypoint.radius + 0.9;
    const advanceDistance =
      waypoint.action === 'jump' ? Math.abs(waypoint.position.z - position.z) : planDistance;
    if (advanceDistance <= acceptance || passed) {
      index += 1;
      continue;
    }
    break;
  }
  return index;
}

/** The nearest idle tile with a small penalty for outer rings and drops. */
export function selectHexTarget(
  tiles: readonly LevelTile[],
  x: number,
  z: number,
  y: number,
  lane: number,
  occupied?: readonly { x: number; z: number }[],
): LevelTile | null {
  const laneAngle = (lane % 6) * (Math.PI / 3);
  let best: LevelTile | null = null;
  let bestScore = Infinity;
  for (const tile of tiles) {
    if (tile.state !== 'idle') continue;
    const dx = tile.x - x;
    const dz = tile.z - z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.55 || distance > 7.5) continue;
    const vertical = tile.y - y;
    if (vertical > 1.5 || vertical < -4.4) continue;
    if (distance > 3.2 && vertical < -2.4) continue;
    let score = distance + Math.abs(vertical) * 0.9 + tile.ring * 0.28;
    if (distance > 1.2) {
      const angle = Math.atan2(dz, dx);
      score += Math.abs(Math.sin(angle - laneAngle)) * 0.22;
    }
    if (occupied) {
      for (const other of occupied) {
        if (Math.hypot(tile.x - other.x, tile.z - other.z) < 0.85) score += 1.1;
      }
    }
    if (score < bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  return best;
}

export class CourseBrain extends BotBrain {
  private waypointIndex = 0;
  private laneOffset = 0;

  reset(): void {
    super.reset();
    this.waypointIndex = 0;
    const lane = (this.owner.id % 7) - 3;
    this.laneOffset = lane * 0.55;
  }

  think(context: BotContext): ControllerFrame {
    const frame = this.baseFrame();
    this.updateCommon(context);
    const { level, body } = context;
    const waypoints = level.waypoints;
    if (waypoints.length === 0) return frame;

    this.waypointIndex = selectCourseWaypoint(waypoints, body.position, this.waypointIndex);
    const waypoint = waypoints[Math.min(this.waypointIndex, waypoints.length - 1)];
    const finalTarget = this.waypointIndex >= waypoints.length;
    const target = finalTarget ? level.finishPosition : waypoint?.position;
    if (!target) return frame;

    if (this.decisionTimer <= 0) {
      this.decisionTimer = this.owner.reaction + 0.12;
      if (this.rng.chance(this.owner.mistakeChance * 0.45)) {
        this.hesitation = this.rng.float(0.2, 0.55);
        this.laneOffset = this.rng.float(-1.1, 1.1);
      }
    }

    this.owner.targetLabel = finalTarget
      ? 'finish'
      : `${this.waypointIndex}:${waypoint?.action ?? 'run'}`;
    const bypass = finalTarget ? 0 : (level.hurdleLane?.(body.position.z) ?? 0);
    const lane = bypass > 0 ? (this.owner.id % 2 === 0 ? -bypass : bypass) : this.laneOffset;
    const landingX = finalTarget ? null : landingCenterX(level, target, body.position.x);
    const targetX = (landingX ?? target.x) + (finalTarget ? 0 : lane);
    const targetZ = target.z;
    const dx = targetX - body.position.x;
    const dz = targetZ - body.position.z;
    const baseSpeed = 0.9 + this.owner.skill * 0.1;
    const speed = this.courseSpeed(this.hesitation > 0 ? baseSpeed * 0.55 : baseSpeed, context);
    this.steer(dx, dz, speed);

    if (this.maybeShoveNeighbour(context)) return frame;

    const rise = target.y - body.position.y;
    const directionLength = Math.hypot(dx, dz) || 1;
    const groundAhead = hasGroundAt(
      level,
      body.position.x + (dx / directionLength) * 0.8,
      body.position.y - 0.08,
      body.position.z + (dz / directionLength) * 0.8,
    );
    // The side lane skips the two low hurdles, but the little gap between the
    // start deck and the next platform still needs its jump.
    const suppressedByLane = bypass > 0 && (waypoint?.position.z ?? 0) < 9.5;
    const hazardClose = body.grounded && hazardWithin(level, body, 3.4);
    this.owner.targetLabel = `${this.owner.targetLabel}${groundAhead ? '' : ' NOGROUND'}${hazardClose ? ' HAZARD' : ''}`;
    if (body.grounded && hazardClose) {
      frame.jumpPressed = true;
      frame.jumpHeld = true;
      this.staleTimer = 0;
    } else if (!groundAhead && (body.grounded || body.wasGrounded)) {
      // A missing floor always beats hesitation or a hurdle detour. Limit the
      // press to the last grounded step (plus the controller's coyote window)
      // so a bot cannot bunny-hop across an entire gap chain.
      frame.jumpPressed = true;
      frame.jumpHeld = true;
      this.staleTimer = 0;
    } else if (body.grounded && this.hesitation <= 0 && !suppressedByLane) {
      const wantsJump = waypoint?.action === 'jump' || rise > 0.45;
      const jumpDistance = waypoint?.action === 'jump' ? 1.7 : 2.6;
      const forwardDistance = Math.abs(target.z - body.position.z);
      if (wantsJump && forwardDistance < jumpDistance) {
        frame.jumpPressed = true;
        frame.jumpHeld = true;
        this.staleTimer = 0;
      }
    }

    const wedged = this.stuckTime > 0.42 || this.staleTimer > 1.1;
    if (wedged && body.grounded && this.recoverCooldown <= 0) {
      frame.jumpPressed = true;
      this.staleTimer = 0;
      this.stuckTime = 0;
      this.recoverCooldown = 0.8;
      if (this.rng.chance(0.25)) this.waypointIndex = Math.min(this.waypointIndex + 1, waypoints.length);
      else this.laneOffset = this.rng.float(-0.9, 0.9);
    }

    if (frame.jumpPressed) this.owner.targetLabel = `${this.owner.targetLabel} JUMP`;
    return frame;
  }
}

export class HexBrain extends BotBrain {
  private target: LevelTile | null = null;
  private lastTileKey = '';

  reset(): void {
    super.reset();
    this.target = null;
    this.lastTileKey = '';
  }

  think(context: BotContext): ControllerFrame {
    const frame = this.baseFrame();
    this.updateCommon(context);
    const { level, body } = context;
    const tiles = level.queryTiles?.() ?? [];
    if (tiles.length === 0) return frame;

    const current = nearestTile(tiles, body.position);
    const currentKey = current ? `${current.x.toFixed(2)},${current.z.toFixed(2)}` : 'air';
    const warning = current?.state === 'warning' || current?.state === 'falling';

    if (currentKey === this.lastTileKey && body.grounded) {
      this.staleTimer += context.dt;
    }
    this.lastTileKey = currentKey;

    const targetGone = !this.target || this.target.state !== 'idle';
    const targetReached = this.target
      ? Math.hypot(this.target.x - body.position.x, this.target.z - body.position.z) < 0.5
      : false;
    if (targetGone || targetReached || this.decisionTimer <= 0 || warning || this.staleTimer > 1.1) {
      const occupied = context.contestants
        .filter((other) => other !== this.owner && !other.body.eliminated)
        .map((other) => ({ x: other.body.position.x, z: other.body.position.z }));
      this.target = selectHexTarget(
        tiles,
        body.position.x,
        body.position.z,
        body.position.y,
        this.owner.lane,
        occupied,
      );
      if (!this.target) {
        const fallback = level.nearestSafeTile?.(body.position) ?? null;
        this.target = fallback;
      }
      this.decisionTimer = this.owner.reaction + 0.18;
      this.staleTimer = 0;
      if (this.rng.chance(this.owner.mistakeChance * 0.35)) {
        this.hesitation = this.rng.float(0.12, 0.35);
      }
    }

    const target = this.target;
    this.owner.targetLabel = target ? `tile ${target.tier}/${target.state}` : 'no-tile';
    if (!target) {
      this.steer(-body.position.x, -body.position.z, 0.82);
      if (body.grounded && this.staleTimer > 0.7) frame.jumpPressed = true;
      return frame;
    }

    const dx = target.x - body.position.x;
    const dz = target.z - body.position.z;
    const horizontal = Math.hypot(dx, dz);
    const speed = this.hesitation > 0 ? 0.7 : 0.92 + this.owner.skill * 0.06;
    this.steer(dx, dz, speed);

    if (body.grounded) {
      if (warning) {
        frame.jumpPressed = true;
        frame.jumpHeld = true;
      } else if (horizontal < 2.15 && target.state === 'idle') {
        frame.jumpPressed = true;
        frame.jumpHeld = true;
      } else if (this.staleTimer > 0.8) {
        frame.jumpPressed = true;
        this.staleTimer = 0;
      }
    }

    return frame;
  }
}

export class CrownBrain extends BotBrain {
  private waypointIndex = 0;
  private climbTimer = 0;

  reset(): void {
    super.reset();
    this.waypointIndex = 0;
    this.climbTimer = 0;
  }

  think(context: BotContext): ControllerFrame {
    const frame = this.baseFrame();
    this.updateCommon(context);
    const { level, body } = context;
    const waypoints = level.waypoints;
    if (waypoints.length === 0) return frame;

    this.waypointIndex = clamp(this.waypointIndex, 0, waypoints.length - 1);
    for (let guard = 0; guard < 3; guard += 1) {
      const waypoint = waypoints[this.waypointIndex];
      if (!waypoint) break;
      const dx = waypoint.position.x - body.position.x;
      const dy = waypoint.position.y - body.position.y;
      const dz = waypoint.position.z - body.position.z;
      const distance = Math.hypot(dx, dz);
      const landedAbove = dy < 0.35 && dy > -1.9 && distance < waypoint.radius + 1.5;
      if ((distance < waypoint.radius + 0.7 && Math.abs(dy) < 1.8) || landedAbove) {
        this.waypointIndex += 1;
        continue;
      }
      break;
    }

    // Recover from a beam hit: if we fell below the current step, re-route from
    // an earlier waypoint instead of running at geometry above us.
    if (body.position.y < (waypoints[this.waypointIndex]?.position.y ?? 0) - 3.2) {
      while (
        this.waypointIndex > 0 &&
        body.position.y < (waypoints[this.waypointIndex]?.position.y ?? 0) - 1.4
      ) {
        this.waypointIndex -= 1;
      }
    }

    this.owner.targetLabel = `${this.waypointIndex}`;
    const target =
      this.waypointIndex >= waypoints.length
        ? level.crownPosition ?? level.finishPosition
        : waypoints[this.waypointIndex]!.position;
    const dx = target.x - body.position.x;
    const dz = target.z - body.position.z;
    const horizontal = Math.hypot(dx, dz);
    const baseSpeed = 0.9 + this.owner.skill * 0.1;
    this.steer(dx, dz, this.courseSpeed(baseSpeed, context));

    if (this.maybeShoveNeighbour(context)) return frame;

    const rise = target.y - body.position.y;
    if (body.grounded && this.hesitation <= 0) {
      const waypoint = waypoints[Math.min(this.waypointIndex, waypoints.length - 1)];
      const wantsJump = waypoint?.action === 'jump' || rise > 0.35;
      if (wantsJump && horizontal < 2.7) {
        frame.jumpPressed = true;
        frame.jumpHeld = true;
      }
    }

    if ((this.stuckTime > 0.5 || this.staleTimer > 1.2) && body.grounded && this.recoverCooldown <= 0) {
      frame.jumpPressed = true;
      this.staleTimer = 0;
      this.stuckTime = 0;
      this.recoverCooldown = 0.75;
      this.climbTimer += 1;
      if (this.climbTimer > 3) {
        this.waypointIndex = Math.max(0, this.waypointIndex - 1);
        this.climbTimer = 0;
      }
    } else if (body.grounded) {
      this.climbTimer = Math.max(0, this.climbTimer - context.dt);
    }

    return frame;
  }
}

function nearestTile(tiles: readonly LevelTile[], position: Vector3): LevelTile | null {
  let best: LevelTile | null = null;
  let bestDistance = 1.1;
  for (const tile of tiles) {
    if (tile.state === 'gone') continue;
    const dx = tile.x - position.x;
    const dz = tile.z - position.z;
    const dy = Math.abs(tile.y - position.y);
    if (dy > 0.9) continue;
    const distance = Math.hypot(dx, dz);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tile;
    }
  }
  return best;
}

export function createBotBrain(
  mode: Level['mode'],
  owner: Contestant,
  seed: number,
): BotBrain | null {
  switch (mode) {
    case 'course':
    case 'training':
      return new CourseBrain(owner, seed, mode === 'course' ? 1 : 9);
    case 'hexapop':
      return new HexBrain(owner, seed, 2);
    case 'crown-climb':
      return new CrownBrain(owner, seed, 3);
    default:
      return null;
  }
}
