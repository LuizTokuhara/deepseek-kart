import * as THREE from "three/webgpu";
import { TitleLogo } from "../rendering/title-logo";

/**
 * Renders the 3D DEEPSEEK KART logo into its own transparent canvas, layered
 * over the race scene. One instance is shared by the title card and the
 * track select: `attach` moves the canvas between them, `play` replays the
 * drop-in, and `stop` halts rendering while the logo is off screen.
 */
export class TitleLogoView {
  readonly canvas = document.createElement("canvas");
  private readonly renderer: THREE.WebGPURenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(26, 2, 0.1, 100);
  private readonly logo = new TitleLogo();
  private readonly resize = new ResizeObserver(() => this.fit());
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private startedAt = 0;
  private playing = false;
  private disposed = false;

  private constructor() {
    this.canvas.className = "logo-3d";
    this.canvas.setAttribute("aria-hidden", "true");
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      forceWebGL: new URLSearchParams(window.location.search).has("webgl"),
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.add(this.logo.group);
    this.resize.observe(this.canvas);
  }

  /** Builds the renderer and compiles the logo; null when 3D is unavailable. */
  static async create(): Promise<TitleLogoView | null> {
    let view: TitleLogoView | null = null;
    try {
      view = new TitleLogoView();
      await view.renderer.init();
      view.fit();
      // Compile with every letter visible, then hide them again until play().
      view.logo.update(10, true);
      await view.renderer.compileAsync(view.scene, view.camera);
      view.logo.update(0, view.reducedMotion.matches);
      return view;
    } catch (error) {
      console.warn("3D logo unavailable; keeping the HTML title", error);
      view?.dispose();
      return null;
    }
  }

  /** Moves the canvas into `slot`, ahead of its other content. */
  attach(slot: HTMLElement): void {
    if (this.canvas.parentElement !== slot) {
      slot.prepend(this.canvas);
    }
    this.fit();
  }

  /** Replays the drop-in animation and keeps rendering until `stop`. */
  play(): void {
    if (this.disposed) {
      return;
    }

    this.startedAt = performance.now();
    this.logo.update(0, this.reducedMotion.matches);
    if (!this.playing) {
      this.playing = true;
      void this.renderer.setAnimationLoop(this.frame);
    }
  }

  stop(): void {
    if (!this.playing) {
      return;
    }

    this.playing = false;
    void this.renderer.setAnimationLoop(null);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.stop();
    this.resize.disconnect();
    this.canvas.remove();
    this.logo.dispose();
    this.renderer.dispose();
  }

  private readonly frame = (now: number): void => {
    this.logo.update((now - this.startedAt) / 1000, this.reducedMotion.matches);
    this.renderer.render(this.scene, this.camera);
  };

  /** Matches the canvas size and backs the camera off until the logo fits. */
  private fit(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    this.logo.bounds.getSize(size);
    this.logo.bounds.getCenter(center);
    // Leave room for the sway, the bob and the tumbling letters.
    const halfHeight = size.y * 0.5 * 1.18;
    const halfWidth = size.x * 0.5 * 1.12;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const distance = Math.max(halfHeight / tan, halfWidth / (tan * this.camera.aspect));
    this.camera.position.set(center.x, center.y, distance + size.z);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();
  }
}
