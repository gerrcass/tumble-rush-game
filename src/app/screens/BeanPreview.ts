import {
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { Bean } from '../../game/player/Bean';
import { BeanBody } from '../../game/physics/BeanBody';
import { BeanController } from '../../game/player/BeanController';
import { PhysicsWorld } from '../../game/physics/PhysicsWorld';
import { makeToonMaterial } from '../../game/util/toon';
import type { BeanLook } from '../../game/cosmetics';

/**
 * Small, self-contained webgl turntable for the Customize screen.
 *
 * It owns its renderer and disposes it (including a forced context loss) when
 * the screen closes, so opening Customize repeatedly cannot leak contexts.
 */
export class BeanPreview {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly world = new PhysicsWorld();
  private readonly body = new BeanBody({ position: undefined });
  private readonly controller: BeanController;
  private readonly turntable = new Group();
  private readonly abort = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private readonly podium: Mesh;
  private readonly trim: Mesh;
  private bean: Bean | null = null;
  private raf = 0;
  private last = 0;
  private elapsed = 0;
  private disposed = false;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(new Color(0x000000), 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.className = 'bean-preview__canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(34, 1, 0.1, 30);
    this.camera.position.set(0.2, 1.55, 5.3);
    this.camera.lookAt(0, 1.02, 0);

    this.scene.add(new HemisphereLight(0xfff2dd, 0xb7e7ff, 1.7));
    const key = new DirectionalLight(0xfff3dc, 2.4);
    key.position.set(3, 6, 5);
    this.scene.add(key);
    const rim = new DirectionalLight(0xffd0a0, 1.1);
    rim.position.set(-5, 2, -3);
    this.scene.add(rim);

    this.podium = new Mesh(
      new CylinderGeometry(1.05, 1.2, 0.22, 36),
      makeToonMaterial({ color: 0xffe2ad }),
    );
    this.podium.position.y = -0.04;
    this.scene.add(this.podium);
    this.trim = new Mesh(
      new CylinderGeometry(1.23, 1.23, 0.08, 36),
      makeToonMaterial({ color: 0xff6b6b }),
    );
    this.trim.position.y = 0.02;
    this.scene.add(this.trim);

    this.scene.add(this.turntable);
    this.controller = new BeanController(this.body, this.world);
    this.body.grounded = true;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    window.addEventListener('resize', this.resize, { signal: this.abort.signal });
    this.raf = requestAnimationFrame(this.frame);
  }

  setLook(look: BeanLook): void {
    if (this.bean) {
      this.turntable.remove(this.bean.group);
      this.bean.dispose();
    }
    this.bean = new Bean({ look, outline: true, name: 'PREVIEW', phase: 1.3 });
    this.bean.setMenuMode(true);
    this.bean.setNameTagVisible(false);
    this.bean.setOutlineEnabled(true);
    this.turntable.add(this.bean.group);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.resizeObserver.disconnect();
    if (this.bean) {
      this.turntable.remove(this.bean.group);
      this.bean.dispose();
      this.bean = null;
    }
    // Only the preview-owned podium is disposed. Bean geometry/materials are
    // session caches shared with the live show and must stay alive.
    this.podium.geometry.dispose();
    (this.podium.material as { dispose(): void }).dispose();
    this.trim.geometry.dispose();
    (this.trim.material as { dispose(): void }).dispose();
    this.renderer.dispose();
    const extension = this.renderer.getContext().getExtension('WEBGL_lose_context');
    extension?.loseContext();
    this.renderer.domElement.remove();
  }

  private resize = (): void => {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.elapsed += dt;
    this.turntable.rotation.y = Math.sin(this.elapsed * 0.45) * 0.52;
    if (this.bean) this.bean.update(dt, this.body, this.controller, this.elapsed);
    this.renderer.render(this.scene, this.camera);
  };
}
