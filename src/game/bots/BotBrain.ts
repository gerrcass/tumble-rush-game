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
  /**
   * The human's Course progress, or null when they are eliminated. The M2
   * anchor only ever slows the pack when the human is far behind.
   */
  humanProgress?: number | null;
  dt: number;
}

/**
 * M2 Course humanization. Bots target 0.62–0.78 of the player's 8 u/s cap,
 * scaled by skill; they never receive speed above the player's cap.
 */
export const COURSE_SPEED_MIN = 0.62;
export const COURSE_SPEED_MAX = 0.78;

/** Human-pace anchor: only when the human is >25% behind, never above 10%. */
export const HUMAN_ANCHOR_THRESHOLD = 0.25;
export const HUMAN_ANCHOR_MAX_SLOWDOWN = 0.1;
/** A human who has not left the start deck is not "behind"; no anchor for idlers. */
export const HUMAN_ANCHOR_MIN_PROGRESS = 0.02;

export interface CourseBrainOptions {
  /** Multiplier on the skill-scaled 0.62–0.78 cruise target speed. */
  speedScale?: number;
  /** Multiplier on the 0.78-of-max jump commitment (a run-up, not cruise). */
  jumpSpeedScale?: number;
  /** Added to the bot's reaction time before re-planning. */
  reactionBonus?: number;
  /** Hazard lookahead radius in world units (humanized bots react later). */
  hazardRadius?: number;
  /** Multiplier on the contestant's seeded mistake chance. */
  mistakeScale?: number;
  /** Flat mistake chance independent of the contestant profile. */
  baseMistake?: number;
  /** Chance a close hazard becomes a jump on any given step. */
  hazardJumpChance?: number;
  /** Chance a scripted run/jump waypoint is committed to. */
  jumpDiscipline?: number;
  /** Multiplier on the per-contestant lane offset (0 = centre line). */
  laneScale?: number;
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

  /** Bounded human-pace anchor from the Course, never above the player cap. */
  protected courseSpeed(base: number, context: BotContext): number {
    const pace = humanPaceAnchor(
      context.humanProgress,
      context.leaderProgress,
      context.level.mode,
    );
    return clamp(base * pace, 0, 1);
  }

  protected maybeShoveNeighbour(context: BotContext): boolean {
    if (this.shoveCooldown > 0) return false;
    if (this.owner.aggression < 0.35) return false;
    // A dive is a committed 8 u/s lunge. On a narrow Course a shove at the lip
    // of a gap is not a comedy beat, it is a double elimination: the shover
    // follows the target into the canyon. A dive travels ~3.6 u, so only pick
    // a fight when both beans have solid ground under and that far ahead.
    if (!context.body.grounded) return false;
    const body = context.body;
    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    const dirX = speed > 0.8 ? body.velocity.x / speed : 0;
    const dirZ = speed > 0.8 ? body.velocity.z / speed : -1;
    if (!hasGroundAt(context.level, body.position.x + dirX * 1.35, body.position.y - 0.08, body.position.z + dirZ * 1.35) ||
        !hasGroundAt(context.level, body.position.x + dirX * 4.5, body.position.y - 0.08, body.position.z + dirZ * 4.5)) {
      return false;
    }
    for (const other of context.contestants) {
      if (other === this.owner || other.body.eliminated || other.status === 'eliminated') continue;
      const dx = other.body.position.x - body.position.x;
      const dz = other.body.position.z - body.position.z;
      const dy = other.body.position.y - body.position.y;
      if (Math.abs(dy) > 1.4) continue;
      if (dx * dx + dz * dz > 1.9 * 1.9) continue;
      if (!hasGroundAt(context.level, other.body.position.x, other.body.position.y - 0.08, other.body.position.z) ||
          !hasGroundAt(context.level, other.body.position.x + dirX * 4.5, other.body.position.y - 0.08, other.body.position.z + dirZ * 4.5)) {
        continue;
      }
      if (!this.rng.chance(this.owner.aggression * this.shoveChance(context))) continue;
      this.shoveCooldown = this.rng.float(2.2, 4.2);
      this.frame.divePressed = true;
      return true;
    }
    return false;
  }

  /**
   * Course racers are contestants, not assassins: a dive at the lip of a gap
   * is a double elimination, and a two-lap race cannot afford the pack to
   * delete itself. Crown Climb keeps the original shove appetite.
   */
  protected shoveChance(context: BotContext): number {
    return context.level.mode === 'course' || context.level.mode === 'training' ? 0.0015 : 0.008;
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

/** Top surface of the nearest solid platform under/near a waypoint, if any. */
export function platformTopAt(level: Level, target: Vector3, tolerance = 2.6): number | null {
  let best: number | null = null;
  for (const collider of level.colliders) {
    if (!collider.enabled || collider.kind !== 'solid') continue;
    const dx = Math.abs(collider.position.x - target.x);
    const dz = Math.abs(collider.position.z - target.z);
    if (collider.shape === 'box') {
      const reach = Math.max(collider.halfExtents.x, collider.halfExtents.z) + 0.4;
      if (dx > reach || dz > reach) continue;
      const top = collider.position.y + collider.halfExtents.y;
      if (Math.abs(top - target.y) <= tolerance) best = Math.max(best ?? top, top);
    } else {
      if (Math.hypot(dx, dz) > collider.radius + 0.4) continue;
      const top = collider.position.y + collider.height / 2;
      if (Math.abs(top - target.y) <= tolerance) best = Math.max(best ?? top, top);
    }
  }
  return best;
}

/**
 * True when a posted hazard collider is close enough, and optionally ahead of
 * the body, to warrant a hop. Distance is measured to the hazard's rotated
 * footprint, not its centre: a long sweeper can reach a bot from several units
 * away, and reacting to the centre alone let the tip clip the pack.
 */
export function hazardWithin(
  level: Level,
  body: BeanBody,
  radius: number,
  forward?: { x: number; z: number },
): boolean {
  const headY = body.position.y + body.height;
  for (const collider of level.colliders) {
    if (!collider.enabled || collider.kind !== 'hazard') continue;
    const dx = collider.position.x - body.position.x;
    const dz = collider.position.z - body.position.z;
    const dy = collider.position.y - body.position.y;
    if (Math.abs(dy) > 2.6) continue;
    // Only a hazard the bean can actually hurdle belongs in the jump decision.
    // The Whirlybird pendulums hang at head height on purpose: jumping into a
    // bob is worse than running under it, so an overhead hazard is ignored.
    const halfHeight =
      collider.shape === 'box' ? collider.halfExtents.y : collider.height / 2;
    if (collider.position.y - halfHeight > headY - 0.12) continue;
    // A tall pusher bar can sweep into a runner from beside them; the forward
    // gate is for rotating sweepers, where jumping after passing overshoots.
    const pusher = collider.shape === 'box' && collider.halfExtents.y >= 0.9;
    if (forward && !pusher && dx * forward.x + dz * forward.z <= 0) continue;
    if (hazardGap(collider, dx, dz) < radius) return true;
  }
  return false;
}

/** Planar distance from a body offset to the collider's rotated footprint. */
function hazardGap(collider: Collider, dx: number, dz: number): number {
  const halfX = collider.shape === 'box' ? collider.halfExtents.x : collider.radius;
  const halfZ = collider.shape === 'box' ? collider.halfExtents.z : collider.radius;
  if (collider.shape === 'box') {
    const { x: qx, y: qy, z: qz, w } = collider.quaternion;
    const ix = -qx;
    const iy = -qy;
    const iz = -qz;
    const tx = 2 * (iy * dz);
    const ty = 2 * (iz * dx - ix * dz);
    const tz = 2 * (-iy * dx);
    const localX = dx + w * tx + (iy * tz - iz * ty);
    const localZ = dz + w * tz + (ix * ty - iy * tx);
    return Math.hypot(Math.max(0, Math.abs(localX) - halfX), Math.max(0, Math.abs(localZ) - halfZ));
  }
  return Math.max(0, Math.hypot(dx, dz) - halfX);
}

/** A pure pacing function: behind speeds up, ahead eases off. */
export function coursePace(botProgress: number, leaderProgress: number): number {
  return clamp(1 + (leaderProgress - botProgress) * 1.4, 0.92, 1.08);
}

/**
 * Is an authored bounce pad close ahead? The pad launches a bean for a fixed
 * hang time, so a human survives it by holding full run. Bots commit to the
 * top of their humanized band when one is near instead of landing short.
 */
export function bouncePadAhead(level: Level, body: BeanBody, distance = 12): boolean {
  for (const collider of level.colliders) {
    if (!collider.enabled || collider.kind !== 'bounce') continue;
    if (body.position.z - collider.position.z < -0.5) continue;
    if (body.position.z - collider.position.z > distance) continue;
    if (Math.abs(collider.position.x - body.position.x) > 3.2) continue;
    if (Math.abs(collider.position.y - body.position.y) > 2.2) continue;
    return true;
  }
  return false;
}

/**
 * The nearest tall, non-rotating hazard bar ahead: the Slime Slide pushers.
 * Sweepers are thin (half-height < 0.9), pendulums rotate, so this identifies
 * the authored pushers without a name or level-specific branch.
 */
export function pusherAhead(level: Level, body: BeanBody, distance = 6.5): Collider | null {
  let best: Collider | null = null;
  let bestGap = distance;
  for (const collider of level.colliders) {
    if (!collider.enabled || collider.kind !== 'hazard' || collider.shape !== 'box') continue;
    if (collider.halfExtents.y < 0.9) continue;
    if (collider.angularVelocity.lengthSq() > 1e-6) continue;
    const gap = body.position.z - collider.position.z;
    if (gap < 1.4 || gap > bestGap) continue;
    if (Math.abs(collider.position.y - body.position.y) > 2.6) continue;
    best = collider;
    bestGap = gap;
  }
  return best;
}

/**
 * Skill-scaled bot target speed in controller units (fraction of MAX_RUN_SPEED).
 * It is a target, not an applied impulse: the same BeanController still owns
 * acceleration, friction and the 8 u/s cap.
 */
export function courseBotSpeed(skill: number): number {
  const clamped = clamp(skill, 0, 1);
  return COURSE_SPEED_MIN + clamped * (COURSE_SPEED_MAX - COURSE_SPEED_MIN);
}

/**
 * M2 human-pace anchor. When the human is more than 25% of the Course behind
 * the leader, bots lose up to 10% of their target speed, ramped over the next
 * 25% of deficit. It returns 1 outside the Course and never returns >1, so it
 * can only slow the pack; it cannot speed a bot up or touch player physics.
 */
export function humanPaceAnchor(
  humanProgress: number | null | undefined,
  leaderProgress: number,
  mode: Level['mode'],
): number {
  if (mode !== 'course' || humanProgress === null || humanProgress === undefined) return 1;
  if (humanProgress < HUMAN_ANCHOR_MIN_PROGRESS) return 1;
  const deficit = leaderProgress - humanProgress;
  if (deficit <= HUMAN_ANCHOR_THRESHOLD) return 1;
  const ramp = clamp(
    (deficit - HUMAN_ANCHOR_THRESHOLD) / HUMAN_ANCHOR_THRESHOLD,
    0,
    1,
  );
  return 1 - ramp * HUMAN_ANCHOR_MAX_SLOWDOWN;
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
  preferRing?: number,
): LevelTile | null {
  const laneAngle = (lane % 6) * (Math.PI / 3);
  let best: LevelTile | null = null;
  let bestScore = Infinity;
  for (const tile of tiles) {
    if (tile.state !== 'idle' || tile.safe) continue;
    const dx = tile.x - x;
    const dz = tile.z - z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.55 || distance > 7.5) continue;
    const vertical = tile.y - y;
    if (vertical > 1.5 || vertical < -4.4) continue;
    if (distance > 3.2 && vertical < -2.4) continue;
    let score = distance + Math.abs(vertical) * 0.9 + tile.ring * 0.28;
    // Hexapop's floor should be eaten ring by ring. Without this penalty a
    // pack at the edge of the consumed circle always picks the next tile
    // outward, reaches the rim in ~15 s and falls off the world. Staying on
    // the current ring (or stepping in) lets the arena last the full beat.
    if (preferRing !== undefined) {
      const outward = tile.ring - preferRing;
      if (outward > 0) score += outward * 3.2;
    }
    if (distance > 1.2) {
      const angle = Math.atan2(dz, dx);
      score += Math.abs(Math.sin(angle - laneAngle)) * 0.55;
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

const COURSE_TUNING: Required<CourseBrainOptions> = {
  speedScale: 1,
  jumpSpeedScale: 1,
  reactionBonus: 0.14,
  hazardRadius: 2.35,
  mistakeScale: 1,
  baseMistake: 0,
  hazardJumpChance: 0.9,
  jumpDiscipline: 0.88,
  laneScale: 1,
};

export class CourseBrain extends BotBrain {
  private waypointIndex = 0;
  private laneOffset = 0;
  private jumpRollIndex = -1;
  private jumpAllowed = true;
  private pusherId = '';
  private pusherLane = 0;
  private readonly tuning: Required<CourseBrainOptions>;

  constructor(owner: Contestant, seed: number, salt = 1, options: CourseBrainOptions = {}) {
    super(owner, seed, salt);
    this.tuning = { ...COURSE_TUNING, ...options };
  }

  reset(): void {
    super.reset();
    this.waypointIndex = 0;
    this.jumpRollIndex = -1;
    this.jumpAllowed = true;
    this.pusherId = '';
    this.pusherLane = 0;
    const lane = (this.owner.id % 7) - 3;
    this.laneOffset = lane * 0.55 * this.tuning.laneScale;
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
      this.decisionTimer = this.owner.reaction + this.tuning.reactionBonus;
      const mistakeChance = clamp(
        this.owner.mistakeChance * this.tuning.mistakeScale + this.tuning.baseMistake,
        0,
        0.4,
      );
      if (this.rng.chance(mistakeChance * 0.45)) {
        this.hesitation = this.rng.float(0.22, 0.62);
        this.laneOffset = this.rng.float(-1.1, 1.1) * this.tuning.laneScale;
      }
    }

    this.owner.targetLabel = finalTarget
      ? 'finish'
      : `${this.waypointIndex}:${waypoint?.action ?? 'run'}`;
    const bypass = finalTarget ? 0 : (level.hurdleLane?.(body.position.z) ?? 0);
    const lane = bypass > 0 ? (this.owner.id % 2 === 0 ? -bypass : bypass) : this.laneOffset;
    const landingX = finalTarget ? null : landingCenterX(level, target, body.position.x);
    let targetX = (landingX ?? target.x) + (finalTarget ? 0 : lane);
    // Pushers sweep most of the narrow bridge. Pick the free side once per bar
    // and hold it until the bar is behind, so a shove has room to recover.
    const pusher = finalTarget ? null : pusherAhead(level, body);
    if (pusher) {
      if (pusher.id !== this.pusherId) {
        this.pusherId = pusher.id;
        const barRight = pusher.position.x + pusher.velocity.x * 0.4 >= 0;
        this.pusherLane = barRight ? -2.1 : 2.1;
      }
      targetX = this.pusherLane;
    } else if (this.pusherId) {
      this.pusherId = '';
      this.pusherLane = 0;
    }
    const targetZ = target.z;
    const dx = targetX - body.position.x;
    const dz = targetZ - body.position.z;
    const rise = target.y - body.position.y;
    // A sliding/moving platform is a timing beat, not a coin flip. Wait at the
    // lip until its current centre is reachable, then commit. This is the same
    // visible hesitation the player sees; no speed is granted.
    const rideX = waypoint?.action === 'ride' && !finalTarget ? landingX : null;
    if (
      rideX !== null &&
      body.grounded &&
      Math.abs(rideX - body.position.x) > 1.5 &&
      Math.abs(targetZ - body.position.z) < 9.2
    ) {
      this.steer(rideX - body.position.x, 0, 0.7);
      this.owner.targetLabel = `${this.owner.targetLabel} WAIT`;
      this.staleTimer = 0;
      return frame;
    }
    const baseSpeed = courseBotSpeed(this.owner.skill) * this.tuning.speedScale;
    const forwardDistance = Math.abs(target.z - body.position.z);
    // A flat scripted jump can be a bounce pad: the authored pad throws a bean
    // ~1.15 s forward and a human clears it by holding full run. Commit to the
    // top of the humanized band (never above it), and do not let the pack
    // anchor shorten that jump into the gap after the pad.
    const commitJump =
      bouncePadAhead(level, body) ||
      (waypoint?.action === 'jump' && rise < 0.45 && forwardDistance < 4.5);
    const jumpSpeed = COURSE_SPEED_MAX * this.tuning.jumpSpeedScale;
    // Build the run-up before the lip, not on the jump frame: a slower casual
    // cruise must not arrive at a 4 u gap with 0.71 actual speed and fall in.
    const jumpApproach =
      !finalTarget && waypoint?.action === 'jump' && forwardDistance < 6.4;
    const speed =
      commitJump || jumpApproach
        ? jumpSpeed
        : this.courseSpeed(this.hesitation > 0 ? baseSpeed * 0.55 : baseSpeed, context);
    this.steer(dx, dz, speed);

    if (this.maybeShoveNeighbour(context)) return frame;

    const directionLength = Math.hypot(dx, dz) || 1;
    const dirX = dx / directionLength;
    const dirZ = dz / directionLength;
    // A real ledge take-off: probe just past the capsule's leading edge, not a
    // leisurely 0.8 u early. A 0.55 u lead leaves 2–3 grounded steps to launch,
    // which is enough for a full-speed jump (≈5.3 u at 8 u/s) to clear the
    // authored A -> B gap instead of clipping its lip.
    const groundAhead = hasGroundAt(
      level,
      body.position.x + dirX * 0.55,
      body.position.y - 0.08,
      body.position.z + dirZ * 0.55,
    );
    // The side lane skips the two low hurdles, but the little gap between the
    // start deck and the next platform still needs its jump.
    const suppressedByLane = bypass > 0 && (waypoint?.position.z ?? 0) < 9.5;
    const hazardClose =
      body.grounded &&
      hazardWithin(level, body, this.tuning.hazardRadius, { x: dirX, z: dirZ });
    this.owner.targetLabel = `${this.owner.targetLabel}${groundAhead ? '' : ' NOGROUND'}${hazardClose ? ' HAZARD' : ''}`;
    if (body.grounded && hazardClose) {
      // A late reaction is the point: the jump appears on a random step inside
      // the lookahead instead of the frame the hazard first enters the radius.
      frame.jumpPressed = this.rng.chance(this.tuning.hazardJumpChance);
      frame.jumpHeld = true;
      this.staleTimer = 0;
    } else if (!groundAhead && (body.grounded || body.wasGrounded)) {
      // A missing floor always beats hesitation or a hurdle detour. A jump
      // commits at the top of the humanized band (still below the player's
      // cap); a slower cruise must not shorten the take-off into a gap.
      this.steer(dx, dz, Math.max(speed, jumpSpeed));
      frame.jumpPressed = true;
      frame.jumpHeld = true;
      this.staleTimer = 0;
    } else if (body.grounded && this.hesitation <= 0 && !suppressedByLane) {
      const wantsJump = waypoint?.action === 'jump' || rise > 0.45;
      const jumpDistance = waypoint?.action === 'jump' ? 1.7 : 2.6;
      if (wantsJump && forwardDistance < jumpDistance) {
        // Decide once per waypoint whether this contestant commits cleanly.
        // A skipped jump is a visible stumble; the ledge probe above is still
        // the safety net, so a missed hop never becomes a hidden teleport.
        if (this.jumpRollIndex !== this.waypointIndex) {
          this.jumpRollIndex = this.waypointIndex;
          this.jumpAllowed = this.rng.chance(this.tuning.jumpDiscipline);
        }
        if (this.jumpAllowed) {
          // The run-up is a committed jump, not the casual cruise: this is the
          // same target the bots use to clear a 4 u gap, still inside the
          // humanized 0.62–0.78 band.
          this.steer(dx, dz, Math.max(speed, jumpSpeed));
          frame.jumpPressed = true;
          frame.jumpHeld = true;
          this.staleTimer = 0;
        }
      }
    }

    const wedged = this.stuckTime > 0.42 || this.staleTimer > 1.1;
    if (wedged && body.grounded && this.recoverCooldown <= 0) {
      frame.jumpPressed = true;
      this.staleTimer = 0;
      this.stuckTime = 0;
      this.recoverCooldown = 0.8;
      if (this.rng.chance(0.25)) this.waypointIndex = Math.min(this.waypointIndex + 1, waypoints.length);
      else this.laneOffset = this.rng.float(-0.9, 0.9) * this.tuning.laneScale;
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
    if (currentKey === this.lastTileKey && body.grounded) {
      this.staleTimer += context.dt;
    } else {
      this.staleTimer = Math.max(0, this.staleTimer - context.dt * 2);
    }
    this.lastTileKey = currentKey;

    // M2-003: a readable dwell. A bot shares the tile's warning with the
    // player: it stays put while the cracks are wide, then leaves on the last
    // beat. This is the same 3.3 s warning the player sees, never a private
    // timer, and it keeps the pack from deleting the floor with bunny hops.
    const leaveAt = 0.55 + (1 - this.owner.skill) * 0.35;
    const dangerLeft = current?.state === 'warning' ? current.warning : 0;
    const holding =
      body.grounded &&
      current !== null &&
      current.state === 'warning' &&
      dangerLeft > leaveAt &&
      !current.safe;

    if (holding) {
      this.target = null;
      this.owner.targetLabel = `hold ${dangerLeft.toFixed(1)}`;
      this.steer(0, 0, 0);
      return frame;
    }

    const targetReached = this.target
      ? Math.hypot(this.target.x - body.position.x, this.target.z - body.position.z) < 0.6
      : false;
    if (
      !this.target ||
      this.target.state !== 'idle' ||
      targetReached ||
      this.staleTimer > 1.6 ||
      this.decisionTimer <= 0
    ) {
      // An adjacent idle tile is the natural next beat. If there is none, the
      // nearest safe tile is the fallback; the brain never aims at a gap.
      this.target = this.pickNeighbour(tiles, context);
      this.decisionTimer = 0.4 + this.owner.reaction;
      if (this.rng.chance(this.owner.mistakeChance * 0.2)) {
        this.hesitation = this.rng.float(0.2, 0.5);
      }
    }

    const target = this.target;
    this.owner.targetLabel = target ? `tile ${target.tier}/${target.ring}` : 'no-tile';
    if (!target) {
      // Nowhere left to stand: drift toward the middle and take the drop.
      this.steer(-body.position.x, -body.position.z, 0.62);
      return frame;
    }

    const dx = target.x - body.position.x;
    const dz = target.z - body.position.z;
    const horizontal = Math.hypot(dx, dz);
    const speed = this.hesitation > 0 ? 0.38 : 0.5 + this.owner.skill * 0.07;
    this.steer(dx, dz, speed);
    this.owner.targetLabel = `${this.owner.targetLabel} ${horizontal.toFixed(1)}`;

    if (body.grounded) {
      const directionLength = horizontal || 1;
      const groundAhead = hasGroundAt(
        context.level,
        body.position.x + (dx / directionLength) * 0.72,
        body.position.y - 0.08,
        body.position.z + (dz / directionLength) * 0.72,
      );
      // Walk between adjacent hexes; commit to a hop when the next step is a
      // gap or the tile below is already dropping. The jump is just an intent
      // frame: the same controller and gravity decide the landing.
      if (!groundAhead) {
        frame.jumpPressed = true;
        frame.jumpHeld = true;
        this.staleTimer = 0;
      } else if (current?.state === 'falling') {
        frame.jumpPressed = true;
        frame.jumpHeld = true;
        this.staleTimer = 0;
      } else if (horizontal > 1.35 && (dangerLeft <= leaveAt + 0.05 || this.staleTimer > 0.8)) {
        frame.jumpPressed = true;
        frame.jumpHeld = true;
        this.staleTimer = 0;
      }
    }

    return frame;
  }

  /**
   * Prefer a neighbouring hex at the same height: it is reachable with one
   * walking step, so the bot leaves before the warning expires. The public
   * target selector still handles occupancy and lane preference.
   */
  private pickNeighbour(
    tiles: readonly LevelTile[],
    context: BotContext,
  ): LevelTile | null {
    const body = context.body;
    const occupied = context.contestants
      .filter((other) => other !== this.owner && !other.body.eliminated)
      .map((other) => ({ x: other.body.position.x, z: other.body.position.z }));
    const near = tiles.filter((tile) => {
      if (tile.state !== 'idle' || tile.safe) return false;
      if (Math.abs(tile.y - body.position.y) > 1.4) return false;
      return Math.hypot(tile.x - body.position.x, tile.z - body.position.z) <= 2.4;
    });
    // A hop reaches ~2.6 u. Only fall back to a drop within that envelope;
    // aiming at a tile 4 u across a hole made the bot leap into the slime and
    // made the Round end before its Sugar Rush beat.
    const reachable = tiles.filter((tile) => {
      if (tile.state !== 'idle' || tile.safe) return false;
      const vertical = tile.y - body.position.y;
      if (vertical > 1.5 || vertical < -3.2) return false;
      return Math.hypot(tile.x - body.position.x, tile.z - body.position.z) <= 2.9;
    });
    const pool = near.length > 0 ? near : reachable;
    if (pool.length === 0) return null;
    const current = nearestTile(tiles, body.position);
    return (
      selectHexTarget(
        pool,
        body.position.x,
        body.position.z,
        body.position.y,
        this.owner.lane,
        occupied,
        current?.ring,
      ) ?? context.level.nearestSafeTile?.(body.position) ?? null
    );
  }
}

export class CrownBrain extends BotBrain {
  private waypointIndex = 0;
  private climbTimer = 0;
  private pauseTimer = 0;
  private pauseIndex = -1;
  private recoveryTimer = 0;

  reset(): void {
    super.reset();
    this.waypointIndex = 0;
    this.climbTimer = 0;
    this.pauseTimer = 0;
    this.pauseIndex = -1;
    this.recoveryTimer = 0;
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
      const dz = waypoint.position.z - body.position.z;
      const distance = Math.hypot(dx, dz);
      const surface = platformTopAt(level, waypoint.position) ?? waypoint.position.y;
      // Only advance when actually standing on the platform. The old check
      // accepted a fly-by within 1.8 u, so bots stepped off a bobbing donut and
      // ran at the next one without a take-off.
      const onPlatform =
        body.grounded && distance < waypoint.radius + 1.2 && Math.abs(body.position.y - surface) < 0.55;
      if (onPlatform) {
        this.waypointIndex += 1;
        continue;
      }
      break;
    }

    // A knock can drop a finalist past several steps. Re-route from the
    // highest platform at or below them instead of running at geometry above
    // their head; the stop is a short recovery, never an elimination. Without
    // this, a fall back to the start deck left the bot pressed against the lip
    // forever, because it kept aiming at a step it could no longer jump to.
    this.rerouteIfBelowRoute(waypoints);

    this.owner.targetLabel = `${this.waypointIndex}`;
    const waypoint = waypoints[Math.min(this.waypointIndex, waypoints.length - 1)];
    const target =
      this.waypointIndex >= waypoints.length
        ? level.crownPosition ?? level.finishPosition
        : waypoints[this.waypointIndex]!.position;

    // Authored waiting beats stretch the climb without teleporting: the bot
    // stands still at the lip, reads the rotating beam or bobbing donut, then
    // commits. Every one of these is a normal grounded stand.
    if (this.pauseIndex !== this.waypointIndex) {
      const pause = crownPauseFor(this.waypointIndex);
      if (pause > 0) {
        this.pauseIndex = this.waypointIndex;
        this.pauseTimer = pause;
      }
    }
    if (this.pauseTimer > 0) {
      this.pauseTimer = Math.max(0, this.pauseTimer - context.dt);
      this.recoveryTimer = 0;
      this.owner.targetLabel = `${this.waypointIndex} WATCH`;
      this.steer(0, 0, 0);
      return frame;
    }
    if (this.recoveryTimer > 0) {
      this.recoveryTimer = Math.max(0, this.recoveryTimer - context.dt);
      this.owner.targetLabel = `${this.waypointIndex} RECOVER`;
      this.steer(0, 0, 0);
      return frame;
    }

    const dx = target.x - body.position.x;
    const dz = target.z - body.position.z;
    const horizontal = Math.hypot(dx, dz);
    const baseSpeed = 0.77 + this.owner.skill * 0.08;
    const directionLength = horizontal || 1;
    const dirX = dx / directionLength;
    const dirZ = dz / directionLength;

    // Donuts rise and fall under the authored waypoint. Wait at the lip for a
    // low pass instead of jumping into the side of a platform that is 2 u up.
    const surfaceY =
      waypoint?.action === 'ride' ? platformTopAt(level, target) ?? target.y : target.y;
    const rise = surfaceY - body.position.y;
    if (waypoint?.action === 'ride' && rise > 1.22 && horizontal < 3.8 && body.grounded) {
      this.steer(dx, dz, 0);
      this.owner.targetLabel = `${this.waypointIndex} WAIT`;
      return frame;
    }

    this.steer(
      dx,
      dz,
      this.courseSpeed(baseSpeed * coursePace(this.owner.progress, context.leaderProgress), context),
    );

    if (this.maybeShoveNeighbour(context)) return frame;

    // A missing floor ahead is a take-off, not a place to run. This is the same
    // ledge probe a human uses; it never adds a jump the controller would not
    // allow, it only presses the button while still grounded.
    const groundAhead = hasGroundAt(
      level,
      body.position.x + dirX * 0.72,
      body.position.y - 0.08,
      body.position.z + dirZ * 0.72,
    );
    if (body.grounded && !groundAhead) {
      frame.jumpPressed = true;
      frame.jumpHeld = true;
      this.staleTimer = 0;
      return frame;
    }

    if (body.grounded && hazardWithin(level, body, 3.7)) {
      // A sweeping beam at ankle height is the final's biggest filter. A hop
      // clears it and costs less than a stumble off the spiral.
      frame.jumpPressed = true;
      frame.jumpHeld = true;
      this.staleTimer = 0;
      return frame;
    }
    if (body.grounded && this.hesitation <= 0) {
      const wantsJump = waypoint?.action === 'jump' || waypoint?.action === 'ride' || rise > 0.3;
      // A 1.1 u riser needs the jump to start while the bean is still ~1.5 u
      // from the lip. A slower M2 climb needs a shorter runway than the original
      // sprint, or the bean reaches the apex before the step and lands short.
      const trigger = clamp(1.45 + Math.max(0, rise) * 1.1, 1.75, 3.05);
      if (wantsJump && horizontal < trigger) {
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

  /**
   * If a knock left the bot below the current step, walk the route back to the
   * highest authored platform it is actually standing at or above. The pause
   * is the "recovery grace": a beat to re-read the climb, not a free jump.
   */
  private rerouteIfBelowRoute(waypoints: readonly Waypoint[]): void {
    if (!this.owner.body.grounded) return;
    const bodyY = this.owner.body.position.y;
    const current = waypoints[this.waypointIndex];
    if (!current || bodyY >= current.position.y - 1) return;
    let index = this.waypointIndex;
    while (index > 0) {
      const previous = waypoints[index - 1]!;
      if (previous.position.y <= bodyY + 0.65) break;
      index -= 1;
    }
    if (index !== this.waypointIndex) {
      this.waypointIndex = index;
      this.pauseIndex = -1;
      this.recoveryTimer = 0.45;
    }
  }
}

/**
 * Authored waiting beats for the final. These are display rhythm, not physics:
 * the bot stands on its platform, lets the hazard cycle, and commits again.
 * Sum is roughly 11 s, which lifts the climb into the M2 45–80 s band without
 * touching the player's controller or the level geometry.
 */
function crownPauseFor(index: number): number {
  switch (index) {
    case 1:
      return 0.6;
    case 4:
      return 0.45;
    case 8:
      return 0.5;
    case 12:
      return 0.7;
    case 13:
    case 15:
    case 17:
    case 19:
    case 21:
      return 0.4;
    case 22:
      return 0.8;
    case 26:
      return 0.55;
    case 30:
      return 0.55;
    case 34:
      return 0.6;
    case 38:
      return 0.7;
    case 41:
      return 0.6;
    case 42:
      return 0.55;
    case 43:
      return 0.75;
    default:
      return 0;
  }
}

function nearestTile(tiles: readonly LevelTile[], position: Vector3): LevelTile | null {
  let best: LevelTile | null = null;
  let bestDistance = 1.1;
  for (const tile of tiles) {
    if (tile.state === 'gone' || tile.safe) continue;
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

/**
 * Debug-only scripted "casual" Course player. It fills the same ControllerFrame
 * the human input does, so it runs through the exact player body, controller,
 * camera basis and physics. It is never installed by normal play; only
 * `__tumble.startCasualRun()` / `setPlayerAutopilot('casual')` reach it.
 *
 * The tuning is deliberately below the bot pack's median: a slightly lower
 * target speed, a longer reaction, later hazard reads and ordinary mistakes.
 */
export const CASUAL_COURSE_OPTIONS: Readonly<CourseBrainOptions> = Object.freeze({
  // A genuinely below-median human, not a top-band bot: 0.91 × 0.78 ≈ 0.71
  // target speed, a longer reaction beat, later hazard reads (radius below the
  // bots' 2.35), and ordinary mistakes.
  speedScale: 0.91,
  // Cruise at ~0.71, but commit jumps like a human holding run: the authored
  // 4 u final gaps are marginal at the bot-band top (0.78) and impossible at
  // casual cruise. This is the same 1.0 controller cap a human gets, not a
  // hidden speed above it.
  jumpSpeedScale: 1.28,
  reactionBonus: 0.18,
  hazardRadius: 2.3,
  baseMistake: 0.005,
  hazardJumpChance: 0.98,
  jumpDiscipline: 0.95,
  laneScale: 0.15,
});

export function createCasualPilot(owner: Contestant, seed: number): CourseBrain {
  return new CourseBrain(owner, seed, 17, CASUAL_COURSE_OPTIONS);
}
