import {
  BackSide,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BeanBody } from '../physics/BeanBody';
import type { BeanController } from './BeanController';
import { createPatternTexture, colorFor, type BeanLook, type EmoteId } from '../cosmetics';
import { mergeColoredMeshes } from '../levels/common';
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
  private readonly tagMaterial: SpriteMaterial;
  private readonly emoteId: EmoteId;

  private facing = 0;
  private diveRotation = 0;
  private blinkTime = 0;
  private runPhase = 0;
  private outlineEnabled: boolean;
  private menuMode = false;
  private celebrating = false;
  private contactShadowEnabled = true;

  constructor(options: BeanOptions) {
    this.look = options.look;
    this.emoteId = options.look.emoteId;
    const palette = colorFor(options.look.colorId);
    this.outlineEnabled = options.outline ?? true;
    this.blinkTime = (options.phase ?? 0) * 3.7;

    const assets = beanAssets();
    const patternTexture = patternTextureFor(options.look);
    const bodyMaterial = bodyMaterialFor(options.look, patternTexture);
    const skinMaterial = toonMaterialFor(palette.hex);
    const accentMaterial = toonMaterialFor(palette.accent);

    this.group.add(this.bodyRoot);
    this.bodyRoot.add(this.spinRoot);
    this.spinRoot.add(this.tiltRoot);
    this.tiltRoot.add(this.squashRoot);

    const body = new Mesh(assets.bodyGeometry, bodyMaterial);
    body.position.y = 0.75;
    body.castShadow = true;
    body.receiveShadow = false;
    this.squashRoot.add(body);

    if (this.outlineEnabled) {
      const outline = new Mesh(assets.bodyGeometry, assets.outlineMaterial);
      outline.position.copy(body.position);
      outline.scale.setScalar(1.038);
      outline.renderOrder = -1;
      this.squashRoot.add(outline);
      this.outlineMesh = outline;
    } else {
      this.outlineMesh = null;
    }

    // Face — pointed toward local -Z, the character's forward direction. Whites,
    // pupils and cheeks are merged pairs so the whole cast stays inside the
    // draw-call budget without losing the blink or the blush.
    this.eyeGroup.position.set(0, 0.99, 0);
    this.squashRoot.add(this.eyeGroup);
    // Every face part shares one vertex-coloured mesh and material. Blinking
    // scales the little face group; no separate eye/pupil/mouth draw calls.
    this.eyeGroup.add(new Mesh(assets.faceGeometry, assets.faceMaterial));

    this.leftArm = this.createLimb(-1, assets.armGeometry, skinMaterial, 1.02);
    this.rightArm = this.createLimb(1, assets.armGeometry, skinMaterial, 1.02);
    this.squashRoot.add(this.leftArm.pivot, this.rightArm.pivot);

    this.leftFoot = this.createFoot(-1, assets.shoeGeometry, accentMaterial);
    this.rightFoot = this.createFoot(1, assets.shoeGeometry, accentMaterial);
    this.squashRoot.add(this.leftFoot.pivot, this.rightFoot.pivot);

    const hat = this.createHat(options.look.hatId);
    hat.group.position.y = 1.45;
    this.squashRoot.add(hat.group);
    this.propeller = hat.propeller;
    this.halo = hat.halo;

    const nameTagTexture = nameTagTextureFor(options.name ?? 'YOU');
    this.tagMaterial = new SpriteMaterial({
      map: nameTagTexture,
      transparent: true,
      depthWrite: false,
      opacity: 1,
    });
    this.nameTag = new Sprite(this.tagMaterial);
    this.nameTag.position.set(0, 2.16, 0);
    this.nameTag.scale.set(1.08, 0.38, 1);
    this.nameTag.renderOrder = 5;
    this.group.add(this.nameTag);

    this.shadow = new Mesh(assets.shadowGeometry, assets.shadowMaterial);
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

  /** Bots skip the extra contact-shadow quad; their body still casts a shadow. */
  setContactShadowVisible(visible: boolean): void {
    this.contactShadowEnabled = visible;
    this.shadow.visible = visible && this.shadow.visible;
  }

  /** A finished Tumbler stays on the gate and cheers instead of racing on. */
  setCelebrating(celebrating: boolean): void {
    this.celebrating = celebrating;
  }

  /** Hide a billboard that would fill the lens when a rival is on top of us. */
  setNameTagVisible(visible: boolean): void {
    this.nameTag.visible = visible;
  }

  /**
   * Fade name tags near the lens and at the far edge of the play space. The
   * player's own tag stays readable over a wider envelope than a bot's.
   */
  setNameTagDistance(distance: number, isPlayer: boolean): void {
    const near = isPlayer ? 1.6 : 5.5;
    const nearFadeStart = isPlayer ? 0.9 : 2.8;
    const far = isPlayer ? 28 : 22;
    let opacity = 1;
    if (distance < near) {
      opacity = Math.max(0, (distance - nearFadeStart) / (near - nearFadeStart));
    }
    else if (distance > far - 2.2) opacity = Math.max(0, (far - distance) / 2.2);
    this.tagMaterial.opacity = opacity;
    this.nameTag.visible = opacity > 0.03;
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

    if (this.celebrating) {
      const cheer = Math.abs(Math.sin(elapsed * 7 + this.blinkTime));
      this.bodyRoot.position.y = cheer * 0.14;
      this.tiltRoot.rotation.z = Math.sin(elapsed * 5.5 + this.blinkTime) * 0.14;
      this.squashRoot.scale.set(1 + cheer * 0.03, 1 - cheer * 0.02, 1 + cheer * 0.03);
      this.leftArm.pivot.rotation.z = -2.5;
      this.rightArm.pivot.rotation.z = 2.5;
      this.leftArm.pivot.rotation.x = -0.2;
      this.rightArm.pivot.rotation.x = -0.2;
      if (this.propeller) this.propeller.rotation.y += dt * 14;
      if (this.halo) this.halo.position.y = 0.31 + Math.sin(elapsed * 2.1) * 0.035;
      this.shadow.visible = this.contactShadowEnabled && body.grounded;
      return;
    }

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
        switch (this.emoteId) {
          case 'flex': {
            this.tiltRoot.rotation.x = -0.08;
            this.leftArm.pivot.rotation.z = -2.35;
            this.rightArm.pivot.rotation.z = 2.35;
            this.leftArm.pivot.rotation.x = -0.3;
            this.rightArm.pivot.rotation.x = -0.3;
            this.squashRoot.scale.set(1.06, 0.97, 1.03);
            this.bodyRoot.position.y = Math.abs(Math.sin(elapsed * 14)) * 0.018;
            break;
          }
          case 'facepalm': {
            this.tiltRoot.rotation.x = 0.12;
            this.tiltRoot.rotation.z = -0.18;
            this.rightArm.pivot.rotation.z = 2.5;
            this.rightArm.pivot.rotation.x = -0.9;
            this.leftArm.pivot.rotation.z = -0.3;
            this.bodyRoot.position.y = -0.02 + Math.sin(elapsed * 6) * 0.008;
            break;
          }
          case 'dance': {
            const beat = Math.sin(elapsed * 10);
            this.tiltRoot.rotation.z = beat * 0.12;
            this.bodyRoot.position.y = Math.abs(beat) * 0.06;
            this.leftArm.pivot.rotation.z = -1.7 + beat * 0.9;
            this.rightArm.pivot.rotation.z = 1.7 + beat * 0.9;
            this.leftFoot.pivot.rotation.x = beat * 0.35;
            this.rightFoot.pivot.rotation.x = -beat * 0.35;
            break;
          }
          case 'wave':
          default: {
            this.tiltRoot.rotation.z = Math.sin(elapsed * 8) * 0.05;
            this.rightArm.pivot.rotation.z = 2.2 + Math.sin(elapsed * 12) * 0.32;
            this.rightArm.pivot.rotation.x = -0.15;
            this.leftArm.pivot.rotation.z = -0.35;
            this.bodyRoot.position.y = Math.abs(Math.sin(elapsed * 8)) * 0.025;
            break;
          }
        }
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

    this.shadow.visible = this.contactShadowEnabled && body.grounded;
  }

  dispose(): void {
    // Shared bean geometry/materials are cached for the session and bounded by
    // the cosmetic catalogue. Only the per-bean name-tag material is unique.
    this.tagMaterial.dispose();
    this.group.removeFromParent();
  }

  private createLimb(
    side: number,
    armGeometry: BufferGeometry,
    material: MeshToonMaterial,
    shoulderY: number,
  ): Limb {
    const pivot = new Group();
    pivot.position.set(side * 0.37, shoulderY, 0);
    const mesh = new Mesh(armGeometry, material);
    // The contact shadow and the body's own shadow carry the grounding read;
    // casting every limb and hat tripled the shadow pass for no visual gain.
    mesh.castShadow = false;
    pivot.add(mesh);
    return { pivot, mesh };
  }

  private createFoot(side: number, shoeGeometry: BufferGeometry, shoeMaterial: MeshToonMaterial): Limb {
    const pivot = new Group();
    pivot.position.set(side * 0.19, 0.14, -0.02);
    const mesh = new Mesh(shoeGeometry, shoeMaterial);
    mesh.position.set(0, -0.07, -0.06);
    mesh.castShadow = false;
    pivot.add(mesh);
    return { pivot, mesh };
  }

  private createHat(id: BeanLook['hatId']): {
    group: Group;
    propeller: Group | null;
    halo: Mesh | null;
  } {
    return createHatModel(id);
  }
}

/**
 * Hats are shared templates: one geometry/material set per hat id for the whole
 * session. Every Tumbler clones the template (geometries and materials are
 * shared by Object3D.clone), so repeated Shows stop allocating ~65 geometries
 * apiece. Only the per-bean name-tag material is unique.
 */
const hatModelCache = new Map<string, Group>();

function hatModelFor(id: BeanLook['hatId']): Group {
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
        const brim = new Mesh(new CylinderGeometry(0.27, 0.3, 0.075, 12), gold);
        brim.position.y = 0.035;
        brim.castShadow = true;
        group.add(brim);
        const dome = new Mesh(new SphereGeometry(0.17, 10, 8), coral);
        dome.scale.set(1, 0.72, 1);
        dome.position.y = 0.12;
        dome.castShadow = true;
        group.add(dome);
        const stalk = new Mesh(new CylinderGeometry(0.025, 0.03, 0.16, 6), ink);
        stalk.position.y = 0.25;
        group.add(stalk);
        propeller = new Group();
        propeller.position.y = 0.34;
        const bladeGeometry = new RoundedBoxGeometry(0.56, 0.035, 0.11, 1, 0.02);
        for (let i = 0; i < 3; i += 1) {
          const blade = new Mesh(bladeGeometry, i === 1 ? cream : gold);
          blade.position.x = 0.26;
          const pivot = new Group();
          pivot.rotation.y = (i * Math.PI * 2) / 3;
          pivot.add(blade);
          propeller.add(pivot);
        }
        const hub = new Mesh(new SphereGeometry(0.075, 6, 6), darkGold);
        propeller.add(hub);
        mergeColoredMeshes(propeller);
        propeller.userData.keep = true;
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
        const jewel = new Mesh(new SphereGeometry(0.045, 6, 5), coral);
        jewel.position.set(0, 0.09, -0.225);
        group.add(jewel);
        break;
      }
      case 'antenna': {
        const stalk = new Mesh(new CylinderGeometry(0.018, 0.022, 0.3, 6), ink);
        stalk.position.y = 0.15;
        group.add(stalk);
        const bobble = new Mesh(new SphereGeometry(0.11, 8, 6), grape);
        bobble.position.y = 0.34;
        bobble.castShadow = true;
        group.add(bobble);
        break;
      }
      case 'ducky': {
        const body = new Mesh(new SphereGeometry(0.17, 8, 6), gold);
        body.scale.set(1.15, 0.85, 1.2);
        body.position.y = 0.13;
        body.castShadow = true;
        group.add(body);
        const head = new Mesh(new SphereGeometry(0.115, 8, 6), gold);
        head.position.set(0, 0.31, -0.02);
        head.castShadow = true;
        group.add(head);
        const beak = new Mesh(new ConeGeometry(0.055, 0.12, 6), coral);
        beak.rotation.x = Math.PI / 2;
        beak.position.set(0, 0.3, -0.14);
        group.add(beak);
        for (const side of [-1, 1]) {
          const eye = new Mesh(new SphereGeometry(0.018, 5, 4), ink);
          eye.position.set(side * 0.05, 0.35, -0.11);
          group.add(eye);
        }
        break;
      }
      case 'cone': {
        const cone = new Mesh(new ConeGeometry(0.24, 0.56, 10), coral);
        cone.position.y = 0.28;
        cone.castShadow = true;
        group.add(cone);
        const tip = new Mesh(new SphereGeometry(0.07, 6, 5), cream);
        tip.position.y = 0.57;
        group.add(tip);
        break;
      }
      case 'halo': {
        halo = new Mesh(new TorusGeometry(0.24, 0.038, 6, 16), gold);
        halo.rotation.x = Math.PI / 2;
        halo.position.y = 0.31;
        halo.userData.keep = true;
        group.add(halo);
        break;
      }
      case 'flower': {
        for (let i = 0; i < 6; i += 1) {
          const angle = (i / 6) * Math.PI * 2;
          const petal = new Mesh(new SphereGeometry(0.085, 6, 5), cream);
          petal.scale.set(1.05, 0.42, 1.5);
          petal.position.set(Math.cos(angle) * 0.17, 0.21, Math.sin(angle) * 0.17);
          petal.rotation.y = -angle;
          group.add(petal);
        }
        const center = new Mesh(new SphereGeometry(0.095, 8, 6), gold);
        center.position.y = 0.23;
        group.add(center);
        const leaf = new Mesh(new SphereGeometry(0.07, 6, 5), mint);
        leaf.scale.set(1.5, 0.3, 0.7);
        leaf.position.set(0.16, 0.08, 0.12);
        group.add(leaf);
        break;
      }
      case 'none':
      default:
        break;
    }
    if (propeller) propeller.name = 'hat-propeller';
    if (halo) halo.name = 'hat-halo';
    // Static hat parts collapse into one vertex-coloured mesh; the spinning
    // propeller and bobbing halo stay separate nodes.
    mergeColoredMeshes(group);
    group.traverse((object) => {
      if (object instanceof Mesh) object.castShadow = false;
    });
    return group;
}

/** Clone the cached hat, keeping geometry and materials shared. */
function createHatModel(id: BeanLook['hatId']): {
  group: Group;
  propeller: Group | null;
  halo: Mesh | null;
} {
  let template = hatModelCache.get(id);
  if (!template) {
    template = hatModelFor(id);
    hatModelCache.set(id, template);
  }
  const group = template.clone(true);
  const propeller = (group.getObjectByName('hat-propeller') as Group | null) ?? null;
  const halo = (group.getObjectByName('hat-halo') as Mesh | null) ?? null;
  return { group, propeller, halo };
}


interface BeanAssets {
  bodyGeometry: CapsuleGeometry;
  faceGeometry: BufferGeometry;
  armGeometry: BufferGeometry;
  shoeGeometry: RoundedBoxGeometry;
  shadowGeometry: PlaneGeometry;
  faceMaterial: MeshBasicMaterial;
  outlineMaterial: MeshBasicMaterial;
  shadowMaterial: MeshBasicMaterial;
}

let beanAssetSet: BeanAssets | null = null;

function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Bean geometry merge failed');
  return merged;
}

/**
 * Merge differently-coloured little face parts into one geometry using a
 * vertex-colour attribute. One shared MeshBasicMaterial then draws the whole
 * set, dropping the per-bean face from four draw calls to two.
 */
function mergeColored(parts: ReadonlyArray<readonly [BufferGeometry, number]>): BufferGeometry {
  const prepared: BufferGeometry[] = [];
  const color = new Color();
  for (const [source, hex] of parts) {
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position') geometry.deleteAttribute(name);
    }
    color.setHex(hex);
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    prepared.push(geometry);
  }
  const merged = mergeGeometries(prepared, false);
  for (const geometry of prepared) geometry.dispose();
  if (!merged) throw new Error('Bean face merge failed');
  return merged;
}

/**
 * Shared bean geometry and materials. Sixteen contestants used to build ~500
 * geometries and a fresh material set per Tumbler; caching here keeps the GC and
 * GPU uploads flat for the whole Show.
 */
function beanAssets(): BeanAssets {
  if (beanAssetSet) return beanAssetSet;
  const eyeBase = new SphereGeometry(0.098, 8, 6);
  const pupilBase = new SphereGeometry(0.048, 6, 5);
  const cheekBase = new SphereGeometry(0.052, 6, 5);
  const whiteParts = [-1, 1].map((side) => eyeBase.clone().translate(side * 0.15, 0, -0.35));
  const pupilParts = [-1, 1].map((side) => pupilBase.clone().translate(side * 0.15, 0.003, -0.432));
  // Face geometry is authored relative to the eye group at y = 0.99.
  const cheekParts = [-1, 1].map((side) =>
    cheekBase.clone().scale(1.1, 0.62, 0.28).translate(side * 0.255, -0.19, -0.348),
  );
  const mouth = new TorusGeometry(0.088, 0.017, 4, 10, Math.PI)
    .rotateZ(Math.PI)
    .translate(0, -0.27, -0.39);
  const faceParts = [
    ...whiteParts.map((part) => [part, 0xfffdf6] as const),
    ...pupilParts.map((part) => [part, 0x24324a] as const),
    [mouth, 0x24324a] as const,
    ...cheekParts.map((part) => [part, 0xffa9b8] as const),
  ];
  eyeBase.dispose();
  pupilBase.dispose();
  cheekBase.dispose();

  const armBase = new CapsuleGeometry(0.072, 0.23, 3, 8);
  const handBase = new SphereGeometry(0.1, 8, 6);
  const armParts = [
    armBase.clone().translate(0, -0.16, 0),
    handBase.clone().translate(0, -0.37, 0),
  ];
  armBase.dispose();
  handBase.dispose();

  beanAssetSet = {
    bodyGeometry: new CapsuleGeometry(0.4, 0.7, 5, 12),
    faceGeometry: mergeColored(faceParts),
    armGeometry: mergeParts(armParts),
    shoeGeometry: new RoundedBoxGeometry(0.27, 0.16, 0.42, 1, 0.07),
    shadowGeometry: new PlaneGeometry(1.25, 1.05),
    faceMaterial: new MeshBasicMaterial({ vertexColors: true }),
    outlineMaterial: new MeshBasicMaterial({ color: 0x24324a, side: BackSide }),
    shadowMaterial: new MeshBasicMaterial({
      map: getShadowTexture(),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  };
  return beanAssetSet;
}

const toonMaterialCache = new Map<string | number, MeshToonMaterial>();
function toonMaterialFor(color: string | number): MeshToonMaterial {
  let material = toonMaterialCache.get(color);
  if (!material) {
    material = makeToonMaterial({ color });
    toonMaterialCache.set(color, material);
  }
  return material;
}

const bodyMaterialCache = new Map<string, MeshToonMaterial>();
function bodyMaterialFor(look: BeanLook, texture: Texture): MeshToonMaterial {
  const key = `${look.colorId}:${look.patternId}`;
  let material = bodyMaterialCache.get(key);
  if (!material) {
    material = makeToonMaterial({ color: 0xffffff, map: texture });
    bodyMaterialCache.set(key, material);
  }
  return material;
}

const patternTextureCache = new Map<string, Texture>();
function patternTextureFor(look: BeanLook): Texture {
  const key = `${look.colorId}:${look.patternId}`;
  let texture = patternTextureCache.get(key);
  if (!texture) {
    texture = createPatternTexture(look);
    patternTextureCache.set(key, texture);
  }
  return texture;
}

const nameTagTextureCache = new Map<string, Texture>();
function nameTagTextureFor(name: string): Texture {
  let texture = nameTagTextureCache.get(name);
  if (!texture) {
    texture = makeNameTagTexture(name);
    nameTagTextureCache.set(name, texture);
  }
  return texture;
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
