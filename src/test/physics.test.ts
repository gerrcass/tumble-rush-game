import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BeanBody } from '../game/physics/BeanBody';
import { FIXED_STEP, PhysicsWorld } from '../game/physics/PhysicsWorld';
import { createBoxCollider } from '../game/physics/Collider';

const step = FIXED_STEP;

function floorWorld(top = 0): { world: PhysicsWorld; body: BeanBody } {
  const world = new PhysicsWorld({ killY: -14 });
  world.addCollider(
    createBoxCollider({
      position: new Vector3(0, top - 0.5, 0),
      halfExtents: new Vector3(20, 0.5, 20),
    }),
  );
  const body = new BeanBody({ position: new Vector3(0, top + 3, 0) });
  world.addBody(body);
  return { world, body };
}

function simulate(world: PhysicsWorld, steps: number): void {
  for (let i = 0; i < steps; i += 1) world.step(step);
}

describe('PhysicsWorld — capsules vs the world', () => {
  it('lands from 10 units and rests without jitter', () => {
    const world = new PhysicsWorld({ killY: -14 });
    world.addCollider(
      createBoxCollider({
        position: new Vector3(0, -0.5, 0),
        halfExtents: new Vector3(20, 0.5, 20),
      }),
    );
    const body = new BeanBody({ position: new Vector3(0, 10, 0) });
    world.addBody(body);

    simulate(world, 240);
    expect(body.grounded).toBe(true);
    expect(Math.abs(body.position.y)).toBeLessThan(0.002);
    expect(Math.abs(body.velocity.y)).toBeLessThan(0.001);

    const heights: number[] = [];
    for (let i = 0; i < 120; i += 1) {
      world.step(step);
      heights.push(body.position.y);
    }
    const min = Math.min(...heights);
    const max = Math.max(...heights);
    expect(max - min).toBeLessThan(0.0005);
    expect(Math.abs(body.velocity.y)).toBeLessThan(0.001);
  });

  it('jumps to a readable 1.35–1.55 unit apex and returns to the floor', () => {
    const { world, body } = floorWorld();
    simulate(world, 120);
    expect(body.grounded).toBe(true);

    body.velocity.y = 8.6;
    body.grounded = false;
    body.support = null;

    let apex = 0;
    let landed = false;
    for (let i = 0; i < 180; i += 1) {
      world.step(step);
      apex = Math.max(apex, body.position.y);
      if (i > 20 && body.grounded) {
        landed = true;
        break;
      }
    }

    expect(apex).toBeGreaterThan(1.35);
    expect(apex).toBeLessThan(1.55);
    expect(landed).toBe(true);
    expect(body.position.y).toBeCloseTo(0, 2);
  });

  it('slides along a wall and cannot tunnel through it at 20 u/s', () => {
    const world = new PhysicsWorld({ killY: -14 });
    world.addCollider(
      createBoxCollider({
        position: new Vector3(0, -0.5, 0),
        halfExtents: new Vector3(20, 0.5, 20),
      }),
    );
    world.addCollider(
      createBoxCollider({
        position: new Vector3(2, 3, 0),
        halfExtents: new Vector3(0.25, 3, 20),
      }),
    );
    const body = new BeanBody({ position: new Vector3(0, 0, 3) });
    world.addBody(body);
    simulate(world, 60);

    for (let i = 0; i < 180; i += 1) {
      body.velocity.x = 20;
      body.velocity.z = -4;
      world.step(step);
      expect(body.position.x).toBeLessThan(1.34);
    }

    expect(body.position.z).toBeLessThan(2.7);
    expect(body.position.y).toBeGreaterThan(-0.05);
    expect(body.position.x).toBeLessThan(1.34);
  });

  it('is carried by a moving platform at 6 u/s', () => {
    const world = new PhysicsWorld({ killY: -14 });
    const platform = createBoxCollider({
      position: new Vector3(0, -0.5, 0),
      halfExtents: new Vector3(2, 0.5, 2),
    });
    world.addCollider(platform);
    const body = new BeanBody({ position: new Vector3(0, 0, 0) });
    world.addBody(body);
    simulate(world, 30);
    expect(body.grounded).toBe(true);
    expect(body.support).toBe(platform);

    for (let i = 0; i < 120; i += 1) {
      platform.prevPosition.copy(platform.position);
      platform.position.x += 6 * step;
      platform.velocity.set(6, 0, 0);
      world.step(step);
    }

    expect(body.grounded).toBe(true);
    expect(body.position.x).toBeCloseTo(platform.position.x, 1);
    expect(Math.abs(body.position.x - 12)).toBeLessThan(0.8);
  });

  it('eliminates a bean below the kill plane', () => {
    const world = new PhysicsWorld({ killY: -14 });
    const body = new BeanBody({ position: new Vector3(0, -14.05, 0) });
    world.addBody(body);
    world.step(step);
    expect(body.eliminated).toBe(true);
  });

  it('bounces off a bounce pad instead of sticking to it', () => {
    const world = new PhysicsWorld({ killY: -14 });
    world.addCollider(
      createBoxCollider({
        kind: 'bounce',
        position: new Vector3(0, -0.25, 0),
        halfExtents: new Vector3(2, 0.25, 2),
        bounceStrength: 13,
      }),
    );
    const body = new BeanBody({ position: new Vector3(0, 3, 0) });
    world.addBody(body);

    let bounced = false;
    for (let i = 0; i < 120; i += 1) {
      world.step(step);
      if (body.velocity.y > 5) bounced = true;
    }
    expect(bounced).toBe(true);
  });

  it('keeps a bean-to-bean shove moving the target', () => {
    const world = new PhysicsWorld({ killY: -14 });
    world.addCollider(
      createBoxCollider({
        position: new Vector3(0, -0.5, 0),
        halfExtents: new Vector3(20, 0.5, 20),
      }),
    );
    const a = new BeanBody({ position: new Vector3(0, 0, 0) });
    const b = new BeanBody({ position: new Vector3(0.75, 0, 0) });
    world.addBody(a);
    world.addBody(b);
    world.applyShove(a, b, 8);
    for (let i = 0; i < 30; i += 1) world.step(step);
    expect(b.position.x).toBeGreaterThan(1.4);
  });

  it('keeps shoulder-to-shoulder bean collisions horizontal', () => {
    const world = new PhysicsWorld({ killY: -14 });
    world.addCollider(
      createBoxCollider({
        position: new Vector3(0, -0.5, 0),
        halfExtents: new Vector3(20, 0.5, 20),
      }),
    );
    const a = new BeanBody({ position: new Vector3(0, 0, 0) });
    const b = new BeanBody({ position: new Vector3(0.78, 0, 0) });
    world.addBody(a);
    world.addBody(b);
    simulate(world, 8);
    // Overlapping capsules must shove apart sideways; the old two-sphere
    // approximation could launch one bean over the other's head.
    expect(a.position.y).toBeLessThan(0.06);
    expect(b.position.y).toBeLessThan(0.06);
    expect(Math.abs(b.position.x - a.position.x)).toBeGreaterThan(0.8);
    expect(Math.abs(a.velocity.y)).toBeLessThan(1);
    expect(Math.abs(b.velocity.y)).toBeLessThan(1);
  });
});
