import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BeanBody } from '../game/physics/BeanBody';
import { FIXED_STEP, GRAVITY, PhysicsWorld } from '../game/physics/PhysicsWorld';
import { createBoxCollider } from '../game/physics/Collider';
import { BeanController, MAX_RUN_SPEED, MOVEMENT_BASE } from '../game/player/BeanController';
import { Contestant } from '../game/match/Contestant';
import { createBotBrain, createCasualPilot } from '../game/bots/BotBrain';
import { TWISTS } from '../game/twist';

const step = FIXED_STEP;

function frame(overrides: Partial<Parameters<BeanController['update']>[1]> = {}) {
  return {
    moveX: 0,
    moveZ: 0,
    cameraYaw: 0,
    jumpPressed: false,
    jumpHeld: false,
    divePressed: false,
    grabPressed: false,
    grabHeld: false,
    emotePressed: false,
    ...overrides,
  };
}

function rig() {
  const world = new PhysicsWorld({ killY: -20 });
  world.addCollider(
    createBoxCollider({
      position: new Vector3(0, -0.5, 0),
      halfExtents: new Vector3(40, 0.5, 40),
    }),
  );
  const body = new BeanBody({ position: new Vector3(0, 0, 0) });
  world.addBody(body);
  const controller = new BeanController(body, world);
  return { world, body, controller };
}

function settle(world: PhysicsWorld, controller: BeanController): void {
  for (let i = 0; i < 30; i += 1) {
    controller.update(step, frame());
    world.step(step);
  }
}

function jumpArc(rules = TWISTS.moon.rules): { apex: number; airtime: number } {
  const { world, body, controller } = rig();
  controller.setRules(rules);
  world.setGravity(GRAVITY * rules.gravityScale);
  settle(world, controller);
  const startY = body.position.y;
  let apex = 0;
  let airtime = 0;
  let landed = false;
  for (let i = 0; i < 240; i += 1) {
    controller.update(step, frame({ jumpPressed: i === 0, jumpHeld: i === 0 }));
    world.step(step);
    apex = Math.max(apex, body.position.y - startY);
    if (i > 2) airtime += step;
    if (i > 10 && body.grounded) {
      landed = true;
      break;
    }
  }
  expect(landed).toBe(true);
  return { apex, airtime };
}

function stopDistance(rules = TWISTS.slippery.rules): { seconds: number; distance: number } {
  const { world, body, controller } = rig();
  controller.setRules(rules);
  settle(world, controller);
  for (let i = 0; i < 240; i += 1) {
    controller.update(step, frame({ moveZ: 1, cameraYaw: 0 }));
    world.step(step);
  }
  const start = body.position.z;
  let seconds = 0;
  for (let i = 0; i < 240; i += 1) {
    controller.update(step, frame());
    world.step(step);
    seconds += step;
    if (Math.hypot(body.velocity.x, body.velocity.z) < 0.001) break;
  }
  return { seconds, distance: Math.abs(body.position.z - start) };
}

describe('M4 twisted physics and controller', () => {
  it('applies setGravity to the next fixed step and rejects an invalid value', () => {
    const a = new PhysicsWorld({ gravity: -26, killY: -50 });
    const bodyA = new BeanBody({ position: new Vector3(0, 5, 0) });
    a.addBody(bodyA);
    a.step(step);
    const classicFall = bodyA.velocity.y;

    const b = new PhysicsWorld({ gravity: -20.28, killY: -50 });
    const bodyB = new BeanBody({ position: new Vector3(0, 5, 0) });
    b.addBody(bodyB);
    b.step(step);
    expect(b.gravity).toBe(-20.28);
    expect(bodyB.velocity.y).toBeGreaterThan(classicFall);
    expect(bodyB.velocity.y).toBeCloseTo((-20.28) * step, 8);

    expect(() => b.setGravity(4)).toThrow();
    expect(() => b.setGravity(Number.NaN)).toThrow();
    b.setGravity(-26);
    expect(b.gravity).toBe(-26);
  });

  it('keeps the classic jump arc and gives MOON a longer, slightly higher jump', () => {
    const classic = jumpArc({ ...TWISTS.moon.rules, id: 'classic', gravityScale: 1, jumpScale: 1 });
    const moon = jumpArc();
    expect(classic.apex).toBeGreaterThan(1.35);
    expect(classic.apex).toBeLessThan(1.55);
    expect(moon.apex).toBeGreaterThan(classic.apex + 0.02);
    expect(moon.airtime).toBeGreaterThan(classic.airtime * 1.1);
  });

  it('makes SLIPPERY stop later without changing the run-speed cap', () => {
    const classic = stopDistance({ ...TWISTS.slippery.rules, id: 'classic', frictionScale: 1, accelScale: 1, airDragScale: 1 });
    const slippery = stopDistance();
    expect(slippery.seconds).toBeGreaterThan(classic.seconds * 1.5);
    expect(slippery.distance).toBeGreaterThan(classic.distance * 1.5);

    for (const rules of [TWISTS.moon.rules, TWISTS.slippery.rules, TWISTS.rush.rules]) {
      const { world, body, controller } = rig();
      controller.setRules(rules);
      settle(world, controller);
      let peak = 0;
      for (let i = 0; i < 600; i += 1) {
        controller.update(step, frame({ moveZ: 1, cameraYaw: 0 }));
        world.step(step);
        peak = Math.max(peak, Math.hypot(body.velocity.x, body.velocity.z));
      }
      expect(peak).toBeLessThanOrEqual(MAX_RUN_SPEED + 0.01);
      expect(peak).toBeGreaterThan(MAX_RUN_SPEED * 0.98);
    }
  });

  it('never changes the dive impulse, jump buffer or max speed', () => {
    const { world, body, controller } = rig();
    controller.setRules(TWISTS.slippery.rules);
    settle(world, controller);
    controller.update(step, frame({ divePressed: true, moveZ: 1 }));
    expect(Math.hypot(body.velocity.x, body.velocity.z)).toBeCloseTo(MOVEMENT_BASE.maxRunSpeed, 5);
    expect(controller.diveCooldown).toBeGreaterThan(1);
    expect(MOVEMENT_BASE.maxRunSpeed).toBe(8);
    controller.setRules(TWISTS.moon.rules);
    controller.update(step, frame({ jumpPressed: true }));
    expect(controller.jumpBuffer).toBeCloseTo(0.12, 5);
    expect(controller.coyote).toBeLessThanOrEqual(0.12);
  });

  it('gives the player and every bot the same public rules object', () => {
    const world = new PhysicsWorld({ killY: -20 });
    const scene = new Scene();
    const rules = TWISTS.moon.rules;
    const contestant = new Contestant({
      id: 3,
      name: 'Test Bean',
      look: { colorId: 'mint', patternId: 'solid', hatId: 'none', emoteId: 'wave' },
      isPlayer: false,
      world,
      scene,
      outline: false,
      phase: 0,
    });
    contestant.controller.setRules(rules);
    const course = createBotBrain('course', contestant, 123, rules);
    const hex = createBotBrain('hexapop', contestant, 123, rules);
    const casual = createCasualPilot(contestant, 123, rules);
    expect(contestant.controller.ruleSet).toBe(rules);
    expect(course?.rules).toBe(rules);
    expect(hex?.rules).toBe(rules);
    expect(casual.rules).toBe(rules);
    expect(course?.rules.gravityScale).toBe(0.78);
    contestant.dispose();
  });
});
