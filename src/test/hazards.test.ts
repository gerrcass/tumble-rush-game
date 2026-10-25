import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BeanBody } from '../game/physics/BeanBody';
import { FIXED_STEP, PhysicsWorld } from '../game/physics/PhysicsWorld';
import {
  createBoxCollider,
  moveCollider,
  type Collider,
} from '../game/physics/Collider';
import { CameraRig } from '../game/player/CameraRig';

function step(world: PhysicsWorld, count: number): void {
  for (let i = 0; i < count; i += 1) world.step(FIXED_STEP);
}

describe('kinematic hazards', () => {
  it('imparts tangential velocity from a spinning hazard collider', () => {
    const world = new PhysicsWorld({ killY: -20 });
    world.addCollider(
      createBoxCollider({
        position: new Vector3(0, -0.5, 0),
        halfExtents: new Vector3(20, 0.5, 20),
      }),
    );
    const beam = createBoxCollider({
      kind: 'hazard',
      position: new Vector3(0, 0.8, 0),
      halfExtents: new Vector3(4, 0.2, 0.35),
      angularVelocity: new Vector3(0, 1.2, 0),
    });
    world.addCollider(beam);
    const body = new BeanBody({ position: new Vector3(2, 1.0, 0) });
    world.addBody(body);

    step(world, 20);
    // omega x r at x=2 is -Z: the beam must sweep the bean off, not just
    // resolve overlap in place.
    expect(body.velocity.z).toBeLessThan(-0.4);
    expect(Math.abs(body.position.z)).toBeGreaterThan(0.1);
  });

  it('records linear velocity for a pendulum-style transform update', () => {
    const collider = createBoxCollider({
      position: new Vector3(0, 0, 0),
      halfExtents: new Vector3(1, 1, 1),
    });
    const start = collider.position.clone();
    moveCollider(collider, 1, 0, 0, 0.5);
    expect(collider.prevPosition).toEqual(start);
    expect(collider.velocity.x).toBeCloseTo(2, 6);
    expect(collider.velocity.y).toBeCloseTo(0, 6);
  });

  it('keeps a hazard collider solid while it moves', () => {
    const world = new PhysicsWorld({ killY: -20 });
    const pusher: Collider = createBoxCollider({
      kind: 'hazard',
      position: new Vector3(0, 1, 0),
      halfExtents: new Vector3(1, 1, 1),
    });
    world.addCollider(pusher);
    const body = new BeanBody({ position: new Vector3(1.6, 0, 0) });
    world.addBody(body);
    moveCollider(pusher, 1.2, 1, 0, FIXED_STEP);
    world.step(FIXED_STEP);
    // The pusher's surface velocity and its solid volume both act on the bean.
    expect(body.velocity.x).toBeGreaterThan(0.5);
    expect(body.position.x).toBeGreaterThan(1.6);
  });
});

describe('CameraRig — no clipping under platforms', () => {
  function makeRig(): { world: PhysicsWorld; body: BeanBody; rig: CameraRig } {
    const world = new PhysicsWorld({ killY: -20 });
    world.addCollider(
      createBoxCollider({
        position: new Vector3(0, -0.5, 0),
        halfExtents: new Vector3(24, 0.5, 24),
      }),
    );
    // Low ceiling: high pitch orbits must be pulled under it.
    world.addCollider(
      createBoxCollider({
        position: new Vector3(0, 4, 0),
        halfExtents: new Vector3(12, 0.5, 12),
      }),
    );
    // Wall on the +X side: side orbits must pull in.
    world.addCollider(
      createBoxCollider({
        position: new Vector3(3.2, 2, 0),
        halfExtents: new Vector3(0.5, 2.2, 8),
      }),
    );
    const body = new BeanBody({ position: new Vector3(0, 0, 0) });
    world.addBody(body);
    const camera = new PerspectiveCamera(68, 16 / 9, 0.1, 100);
    const rig = new CameraRig(camera, world);
    rig.setFloor(0.5);
    rig.snapBehind(body);
    return { world, body, rig };
  }

  it('never settles inside geometry across the orbit range', () => {
    const { world, body, rig } = makeRig();
    const view = { orbitX: 0, orbitY: 0, zoom: 0 };
    const context = { menu: false, celebrating: false, reducedMotion: true };
    let time = 0;

    for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.35) {
      for (let pitch = -5; pitch <= 65; pitch += 10) {
        rig.setCamera(yaw, (pitch * Math.PI) / 180, 8);
        for (let frame = 0; frame < 12; frame += 1) {
          time += 0.016;
          rig.update(0.016, body, view, context, time);
        }
        expect(
          world.pointBlocked(rig.camera.position, 0.28),
          `camera clipped at yaw ${yaw.toFixed(2)} pitch ${pitch}`,
        ).toBe(false);
        expect(rig.camera.position.y).toBeGreaterThanOrEqual(rig.floorY - 0.001);
      }
    }
  });

  it('honours the Round camera floor when slime rises', () => {
    const { body, rig } = makeRig();
    rig.setFloor(6.5);
    rig.setCamera(Math.PI, -0.05, 8);
    const view = { orbitX: 0, orbitY: 0, zoom: 0 };
    const context = { menu: false, celebrating: false, reducedMotion: true };
    for (let frame = 0; frame < 30; frame += 1) {
      rig.update(0.016, body, view, context, frame * 0.016);
    }
    expect(rig.camera.position.y).toBeGreaterThanOrEqual(6.499);
  });
});
