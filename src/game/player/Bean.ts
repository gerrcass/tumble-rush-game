import {
  BackSide,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { BeanBody } from '../physics/BeanBody';
import type { BeanController } from './BeanController';
import { createPatternTexture, colorFor, type BeanLook } from '../cosmetics';
import {
  canvasTexture,
  getShadowTexture,
  makeToonMaterial,
  roundRect,
} from '../util/toon';
import { clamp, dampAngle } from '../util/math';

export interface BeanOptions {
  look: BeanLook;
  outline?: boolean;
  name?: string;
  phase?: number;
}

interface Limb {
  pivot: Group;
  mesh: Mesh;
}

/**
 * Procedural jelly-bean character: squishy capsule body, patterned skin, face,
 * stubby arms, chunky feet, a hat and a soft contact shadow.
 *
 * All animation is applied to nested groups around the physics capsule. The
 * physics body never tilts or squashes; presentation does. Dive spins and
 * stumble wobbles therefore stay readable without changing collision.
 */
export class Bean {
  readonly group = new Group();
  readonly look: BeanLook;

  private readonly bodyRoot = new Group();
  private readonly spinRoot = new Group();
  private readonly tiltRoot = new Group();
  private readonly squashRoot = new Group();

  private readonly leftArm: Limb;
  private readonly rightArm: Limb;
  private readonly leftFoot: Limb;
  private readonly rightFoot: Limb;
  private readonly eyeGroup = new Group();
  private readonly propeller: Group | null;
  private readonly halo: Mesh | null;
  private readonly outlineMesh: Mesh | null;
  private readonly shadow: Mesh;
  private readonly nameTag: Sprite;

  private readonly ownedTextures = new Set<Texture>();

  private facing = 0;
  private diveRotation = 0;
  private blinkTime = 0;
  private runPhase = 0;
  private outlineEnabled: boolean;
  private menuMode = false;

  constructor(options: BeanOptions) {
    this.look = options.look;
    const palette = colorFor(options.look.colorId);
    this.outlineEnabled = options.outline ?? true;
    this.blinkTime = (options.phase ?? 0) * 3.7;

    const patternTexture = createPatternTexture(options.look);
    this.ownedTextures.add(patternTexture);

    this.group.add(this.bodyRoot);
    this.bodyRoot.add(this.spinRoot);
    this.spinRoot.add(this.tiltRoot);
    this.tiltRoot.add(this.squashRoot);

    const bodyMaterial = makeToonMaterial({ color: 0xffffff, map: patternTexture });
    const skinMaterial = makeToonMaterial({ color: palette.hex });
    const accentMaterial = makeToonMaterial({ color: palette.accent });
    const inkMaterial = new MeshBasicMaterial({ color: 0x24324a });
    const blushMaterial = new MeshBasicMaterial({
      color: 0xff8fa3,
      transparent: true,
      opacity: 0.55,
      side: DoubleSide,
    });

    const bodyGeometry = new CapsuleGeometry(0.4, 0.7, 8, 20);
    const body = new Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.75;
    body.castShadow = true;
    body.receiveShadow = false;
    this.squashRoot.add(body);

    if (this.outlineEnabled) {
      const outlineMaterial = new MeshBasicMaterial({
        color: 0x24324a,
        side: BackSide,
      });
      const outline = new Mesh(bodyGeometry, outlineMaterial);
      outline.position.copy(body.position);
      outline.scale.setScalar(1.038);
      outline.renderOrder = -1;
      this.squashRoot.add(outline);
      this.outlineMesh = outline;
    } else {
      this.outlineMesh = null;
    }

    // Face — pointed toward local -Z, the character's forward direction.
    const eyeGeometry = new SphereGeometry(0.098, 14, 10);
    const pupilGeometry = new SphereGeometry(0.048, 10, 8);
    const eyeWhiteMaterial = new MeshBasicMaterial({ color: 0xfffdf6 });
    this.eyeGroup.position.set(0, 0.99, 0);
    this.squashRoot.add(this.eyeGroup);
    for (const side of [-1, 1]) {
      const white = new Mesh(eyeGeometry, eyeWhiteMaterial);
      white.position.set(side * 0.15, 0, -0.35);
      this.eyeGroup.add(white);
      const pupil = new Mesh(pupilGeometry, inkMaterial);
      pupil.position.set(side * 0.15, 0.003, -0.432);
      this.eyeGroup.add(pupil);
    }

    const mouthGeometry = new TorusGeometry(0.088, 0.017, 6, 16, Math.PI);
    const mouth = new Mesh(mouthGeometry, inkMaterial);
    mouth.position.set(0, 0.72, -0.39);
    mouth.rotation.z = Math.PI;
    this.squashRoot.add(mouth);

    for (const side of [-1, 1]) {
      const cheek = new Mesh(new SphereGeometry(0.052, 10, 8), blushMaterial);
      cheek.scale.set(1.1, 0.62, 0.28);
      cheek.position.set(side * 0.255, 0.8, -0.348);
      this.squashRoot.add(cheek);
    }

    const armGeometry = new CapsuleGeometry(0.072, 0.23, 4, 10);
    const handGeometry = new SphereGeometry(0.1, 10, 8);
    this.leftArm = this.createLimb(-1, armGeometry, handGeometry, skinMaterial, 1.02);
    this.rightArm = this.createLimb(1, armGeometry, handGeometry, skinMaterial, 1.02);
    this.squashRoot.add(this.leftArm.pivot, this.rightArm.pivot);

    const shoeGeometry = new RoundedBoxGeometry(0.27, 0.16, 0.42, 2, 0.07);
    this.leftFoot = this.createFoot(-1, shoeGeometry, accentMaterial, skinMaterial);
    this.rightFoot = this.createFoot(1, shoeGeometry, accentMaterial, skinMaterial);
    this.squashRoot.add(this.leftFoot.pivot, this.rightFoot.pivot);

    const hat = this.createHat(options.look.hatId);
    hat.group.position.y = 1.45;
    this.squashRoot.add(hat.group);
    this.propeller = hat.propeller;
    this.halo = hat.halo;

    const nameTagTexture = makeNameTagTexture(options.name ?? 'YOU');
    this.ownedTextures.add(nameTagTexture);
    const tagMaterial = new SpriteMaterial({
      map: nameTagTexture,
      transparent: true,
      depthWrite: false,
    });
    this.nameTag = new Sprite(tagMaterial);
    this.nameTag.position.set(0, 2.16, 0);
    this.nameTag.scale.set(1.08, 0.38, 1);
    this.nameTag.renderOrder = 5;
    this.group.add(this.nameTag);

    const shadowMaterial = new MeshBasicMaterial({
      map: getShadowTexture(),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    this.shadow = new Mesh(new PlaneGeometry(1.25, 1.05), shadowMaterial);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = 1;
    this.group.add(this.shadow);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /** In the menu the bean turns to face the camera while the course waits behind it. */
  setMenuMode(enabled: boolean): void {
    this.menuMode = enabled;
    if (!enabled) {
      this.facing = 0;
      this.group.rotation.y = 0;
    } else {
      this.facing = Math.PI;
      this.group.rotation.y = Math.PI;
    }
  }

  setOutlineEnabled(enabled: boolean): void {
    this.outlineEnabled = enabled;
    if (this.outlineMesh) this.outlineMesh.visible = enabled;
  }

  update(dt: number, body: BeanBody, controller: BeanController, elapsed: number): void {
    this.group.position.copy(body.position);
    const motion = controller.motionState;
    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    const speedRatio = clamp(speed / 8, 0, 1);

    if (this.menuMode) {
      this.facing = dampAngle(this.facing, Math.PI, 5, dt);
    } else if (speed > 0.38) {
      const targetFacing = Math.atan2(-body.velocity.x, -body.velocity.z);
      this.facing = dampAngle(this.facing, targetFacing, motion === 'dive' ? 6 : 13, dt);
    }
    this.group.rotation.y = this.facing;

    // Reset the presentation skeleton to neutral before layering animation.
    this.bodyRoot.position.set(0, 0, 0);
    this.tiltRoot.rotation.set(0, 0, 0);
    this.squashRoot.scale.set(1, 1, 1);
    this.squashRoot.position.y = 0;

    this.leftArm.pivot.rotation.set(0, 0, -0.13);
    this.rightArm.pivot.rotation.set(0, 0, 0.13);
    this.leftFoot.pivot.rotation.set(0, 0, 0);
    this.rightFoot.pivot.rotation.set(0, 0, 0);

    this.runPhase += dt * (6 + speed * 0.8);
    const runSwing = Math.sin(this.runPhase);
    const breathe = Math.sin(elapsed * 2.2 + this.blinkTime);

    this.eyeGroup.scale.y = 1;
    const blinkCycle = (elapsed + this.blinkTime) % 4.6;
    if (blinkCycle > 4.34) this.eyeGroup.scale.y = 0.1;

    switch (motion) {
      case 'run': {
        this.bodyRoot.position.y = Math.abs(runSwing) * 0.055;
        this.tiltRoot.rotation.x = -0.16 * speedRatio;
        this.tiltRoot.rotation.z = Math.sin(this.runPhase * 0.5) * 0.045;
        this.squashRoot.scale.set(1 + 0.03 * speedRatio, 1 - 0.02 * speedRatio, 1 + 0.03 * speedRatio);
        this.leftFoot.pivot.rotation.x = runSwing * 0.95;
        this.rightFoot.pivot.rotation.x = -runSwing * 0.95;
        this.leftArm.pivot.rotation.x = -runSwing * 0.85;
        this.rightArm.pivot.rotation.x = runSwing * 0.85;
        this.leftArm.pivot.rotation.z = -0.2;
        this.rightArm.pivot.rotation.z = 0.2;
        break;
      }
      case 'air': {
        this.tiltRoot.rotation.x = clamp(-body.velocity.y * 0.012, -0.16, 0.14);
        this.squashRoot.scale.set(0.985, 1.035, 0.985);
        this.leftFoot.pivot.rotation.x = -0.75;
        this.rightFoot.pivot.rotation.x = -0.62;
        this.leftArm.pivot.rotation.z = -1.15;
        this.rightArm.pivot.rotation.z = 1.15;
        this.leftArm.pivot.rotation.x = -0.3;
        this.rightArm.pivot.rotation.x = -0.3;
        break;
      }
      case 'dive': {
        this.tiltRoot.rotation.x = 0.18;
        this.squashRoot.scale.set(1.07, 0.88, 1.07);
        this.leftArm.pivot.rotation.x = -1.5;
        this.rightArm.pivot.rotation.x = -1.5;
        this.leftArm.pivot.rotation.z = -0.25;
        this.rightArm.pivot.rotation.z = 0.25;
        this.leftFoot.pivot.rotation.x = -0.6;
        this.rightFoot.pivot.rotation.x = -0.6;
        break;
      }
      case 'stumble': {
        const wobble = Math.sin(elapsed * 34);
        this.tiltRoot.rotation.z = wobble * 0.24;
        this.tiltRoot.rotation.x = Math.sin(elapsed * 19) * 0.08;
        this.bodyRoot.position.y = Math.abs(wobble) * 0.045;
        this.leftArm.pivot.rotation.z = -1.4 + wobble * 0.35;
        this.rightArm.pivot.rotation.z = 1.4 + wobble * 0.35;
        this.leftFoot.pivot.rotation.z = wobble * 0.15;
        this.rightFoot.pivot.rotation.z = -wobble * 0.15;
        break;
      }
      case 'grab': {
        this.tiltRoot.rotation.x = -0.1;
        this.leftArm.pivot.rotation.x = -1.45;
        this.rightArm.pivot.rotation.x = -1.45;
        this.leftArm.pivot.rotation.z = -0.22;
        this.rightArm.pivot.rotation.z = 0.22;
        this.squashRoot.scale.set(0.99, 0.94, 1.02);
        break;
      }
      case 'emote': {
        this.tiltRoot.rotation.z = Math.sin(elapsed * 8) * 0.05;
        this.rightArm.pivot.rotation.z = 2.2 + Math.sin(elapsed * 12) * 0.32;
        this.rightArm.pivot.rotation.x = -0.15;
        this.leftArm.pivot.rotation.z = -0.35;
        this.bodyRoot.position.y = Math.abs(Math.sin(elapsed * 8)) * 0.025;
        break;
      }
      case 'idle':
      default: {
        this.bodyRoot.position.y = breathe * 0.022;
        this.squashRoot.scale.set(1 - breathe * 0.012, 1 + breathe * 0.02, 1 - breathe * 0.012);
        this.tiltRoot.rotation.z = Math.sin(elapsed * 1.1 + this.blinkTime) * 0.022;
        this.leftArm.pivot.rotation.z = -0.13 + breathe * 0.025;
        this.rightArm.pivot.rotation.z = 0.13 - breathe * 0.025;
        break;
      }
    }

    // Dive spin: one clean forward flip per dive, finished smoothly even if the
    // state ends a fraction of a radian early.
    if (motion === 'dive') {
      this.diveRotation = Math.min(Math.PI * 2, this.diveRotation + dt * 15);
    } else if (this.diveRotation > 0.02) {
      this.diveRotation = Math.min(Math.PI * 2, this.diveRotation + dt * 22);
      if (this.diveRotation >= Math.PI * 2 - 0.01) this.diveRotation = 0;
    } else {
      this.diveRotation = 0;
    }
    this.spinRoot.rotation.x = this.diveRotation;

    if (controller.landTimer > 0) {
      const envelope = Math.sin((controller.landTimer / 0.22) * Math.PI);
      this.squashRoot.scale.x *= 1 + envelope * 0.18;
      this.squashRoot.scale.z *= 1 + envelope * 0.12;
      this.squashRoot.scale.y *= 1 - envelope * 0.24;
      this.leftFoot.pivot.rotation.z = 0.25 * envelope;
      this.rightFoot.pivot.rotation.z = -0.25 * envelope;
    }

    if (this.propeller) this.propeller.rotation.y += dt * (motion === 'idle' ? 3.2 : 9);
    if (this.halo) this.halo.position.y = 0.31 + Math.sin(elapsed * 2.1) * 0.035;

    const shadowMaterial = this.shadow.material as MeshBasicMaterial;
    shadowMaterial.opacity = body.grounded ? 0.4 : 0.08;
    this.shadow.visible = body.grounded;
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof Mesh || object instanceof Sprite) {
        object.geometry?.dispose();
        const material = object.material;
        if (Array.isArray(material)) {
          for (const item of material) item.dispose();
        } else if (material) {
          material.dispose();
        }
      }
    });
    for (const texture of this.ownedTextures) texture.dispose();
    this.group.removeFromParent();
  }

  private createLimb(
    side: number,
    armGeometry: CapsuleGeometry,
    handGeometry: SphereGeometry,
    material: MeshToonMaterial,
    shoulderY: number,
  ): Limb {
    const pivot = new Group();
    pivot.position.set(side * 0.37, shoulderY, 0);
    const mesh = new Mesh(armGeometry, material);
    mesh.position.y = -0.16;
    mesh.castShadow = true;
    pivot.add(mesh);
    const hand = new Mesh(handGeometry, material);
    hand.position.y = -0.37;
    hand.castShadow = true;
    pivot.add(hand);
    return { pivot, mesh };
  }

  private createFoot(
    side: number,
    shoeGeometry: RoundedBoxGeometry,
    shoeMaterial: MeshToonMaterial,
    legMaterial: MeshToonMaterial,
  ): Limb {
    const pivot = new Group();
    pivot.position.set(side * 0.19, 0.14, -0.02);
    const mesh = new Mesh(shoeGeometry, shoeMaterial);
    mesh.position.set(0, -0.07, -0.06);
    mesh.castShadow = true;
    pivot.add(mesh);
    const ankle = new Mesh(new SphereGeometry(0.09, 8, 6), legMaterial);
    ankle.position.set(0, 0.02, 0);
    ankle.scale.set(1, 0.8, 1);
    pivot.add(ankle);
    return { pivot, mesh };
  }

  private createHat(id: BeanLook['hatId']): { group: Group; propeller: Group | null; halo: Mesh | null } {
    const group = new Group();
    let propeller: Group | null = null;
    let halo: Mesh | null = null;
    const palette = new Map<number, MeshToonMaterial>();
    const material = (hex: number): MeshToonMaterial => {
      let existing = palette.get(hex);
      if (!existing) {
        existing = makeToonMaterial({ color: hex });
        palette.set(hex, existing);
      }
      return existing;
    };
    const gold = material(0xffc145);
    const darkGold = material(0xf5a623);
    const ink = material(0x24324a);
    const cream = material(0xfff6e5);
    const coral = material(0xff6b6b);
    const mint = material(0x59d9b0);
    const grape = material(0xa78bfa);

    switch (id) {
      case 'propeller': {
        const brim = new Mesh(new CylinderGeometry(0.27, 0.3, 0.075, 20), gold);
        brim.position.y = 0.035;
        brim.castShadow = true;
        group.add(brim);
        const dome = new Mesh(new SphereGeometry(0.17, 16, 12), coral);
        dome.scale.set(1, 0.72, 1);
        dome.position.y = 0.12;
        dome.castShadow = true;
        group.add(dome);
        const stalk = new Mesh(new CylinderGeometry(0.025, 0.03, 0.16, 8), ink);
        stalk.position.y = 0.25;
        group.add(stalk);
        propeller = new Group();
        propeller.position.y = 0.34;
        const bladeGeometry = new RoundedBoxGeometry(0.56, 0.035, 0.11, 2, 0.02);
        for (let i = 0; i < 3; i += 1) {
          const blade = new Mesh(bladeGeometry, i === 1 ? cream : gold);
          blade.position.x = 0.26;
          const pivot = new Group();
          pivot.rotation.y = (i * Math.PI * 2) / 3;
          pivot.add(blade);
          propeller.add(pivot);
        }
        const hub = new Mesh(new SphereGeometry(0.075, 10, 8), darkGold);
        propeller.add(hub);
        group.add(propeller);
        break;
      }
      case 'crown': {
        const base = new Mesh(new CylinderGeometry(0.21, 0.24, 0.15, 6), gold);
        base.position.y = 0.075;
        base.castShadow = true;
        group.add(base);
        for (let i = 0; i < 5; i += 1) {
          const angle = (i / 5) * Math.PI * 2;
          const spike = new Mesh(new ConeGeometry(0.062, 0.22, 5), gold);
          spike.position.set(Math.cos(angle) * 0.16, 0.2, Math.sin(angle) * 0.16);
          spike.castShadow = true;
          group.add(spike);
        }
        const jewel = new Mesh(new SphereGeometry(0.045, 8, 6), coral);
        jewel.position.set(0, 0.09, -0.225);
        group.add(jewel);
        break;
      }
      case 'antenna': {
        const stalk = new Mesh(new CylinderGeometry(0.018, 0.022, 0.3, 6), ink);
        stalk.position.y = 0.15;
        group.add(stalk);
        const bobble = new Mesh(new SphereGeometry(0.11, 14, 10), grape);
        bobble.position.y = 0.34;
        bobble.castShadow = true;
        group.add(bobble);
        break;
      }
      case 'ducky': {
        const body = new Mesh(new SphereGeometry(0.17, 14, 10), gold);
        body.scale.set(1.15, 0.85, 1.2);
        body.position.y = 0.13;
        body.castShadow = true;
        group.add(body);
        const head = new Mesh(new SphereGeometry(0.115, 12, 10), gold);
        head.position.set(0, 0.31, -0.02);
        head.castShadow = true;
        group.add(head);
        const beak = new Mesh(new ConeGeometry(0.055, 0.12, 8), coral);
        beak.rotation.x = Math.PI / 2;
        beak.position.set(0, 0.3, -0.14);
        group.add(beak);
        for (const side of [-1, 1]) {
          const eye = new Mesh(new SphereGeometry(0.018, 6, 5), ink);
          eye.position.set(side * 0.05, 0.35, -0.11);
          group.add(eye);
        }
        break;
      }
      case 'cone': {
        const cone = new Mesh(new ConeGeometry(0.24, 0.56, 18), coral);
        cone.position.y = 0.28;
        cone.castShadow = true;
        group.add(cone);
        const tip = new Mesh(new SphereGeometry(0.07, 8, 6), cream);
        tip.position.y = 0.57;
        group.add(tip);
        break;
      }
      case 'halo': {
        halo = new Mesh(new TorusGeometry(0.24, 0.038, 8, 26), gold);
        halo.rotation.x = Math.PI / 2;
        halo.position.y = 0.31;
        group.add(halo);
        break;
      }
      case 'flower': {
        for (let i = 0; i < 6; i += 1) {
          const angle = (i / 6) * Math.PI * 2;
          const petal = new Mesh(new SphereGeometry(0.085, 8, 6), cream);
          petal.scale.set(1.05, 0.42, 1.5);
          petal.position.set(Math.cos(angle) * 0.17, 0.21, Math.sin(angle) * 0.17);
          petal.rotation.y = -angle;
          group.add(petal);
        }
        const center = new Mesh(new SphereGeometry(0.095, 10, 8), gold);
        center.position.y = 0.23;
        group.add(center);
        const leaf = new Mesh(new SphereGeometry(0.07, 8, 6), mint);
        leaf.scale.set(1.5, 0.3, 0.7);
        leaf.position.set(0.16, 0.08, 0.12);
        group.add(leaf);
        break;
      }
      case 'none':
      default:
        break;
    }
    return { group, propeller, halo };
  }
}

function makeNameTagTexture(name: string): Texture {
  const texture = canvasTexture(256, 96, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#24324a';
    roundRect(ctx, 14, 20, w - 28, h - 34, 26);
    ctx.fill();
    const gradient = ctx.createLinearGradient(0, 20, 0, h - 20);
    gradient.addColorStop(0, '#fff6e5');
    gradient.addColorStop(1, '#ffe1a8');
    ctx.fillStyle = gradient;
    roundRect(ctx, 20, 12, w - 40, h - 34, 22);
    ctx.fill();
    ctx.fillStyle = '#24324a';
    ctx.font = '700 38px "Fredoka Variable", Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, w / 2, h / 2 - 2);
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(32, 16, 5, 0, Math.PI * 2);
    ctx.arc(w - 32, 16, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
