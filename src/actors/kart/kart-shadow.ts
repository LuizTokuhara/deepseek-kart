import * as THREE from "three";
import { GROUND_Y } from "../../core/config";
import { clamp } from "../../core/math";
import type { KartState } from "../../core/types";
import type { KartTrack } from "./kart";

// A dense chassis core, four tire contacts and a narrow feathered perimeter.
// Shared procedural data: no canvas, image downloads or per-frame texture work.
const size = 64;
const pixels = new Uint8Array(size * size * 4);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const px = (x / (size - 1) * 2 - 1) * 0.94;
    const pz = (y / (size - 1) * 2 - 1) * 1.26;
    const body = Math.exp(-((px / 0.68) ** 6 + (pz / 1.05) ** 6) * 1.7);
    let contact = 0;
    for (const side of [-1, 1]) {
      for (const axle of [-0.7, 0.7]) {
        contact = Math.max(contact, Math.exp(-(((px - side * 0.72) / 0.21) ** 4 + ((pz - axle) / 0.4) ** 4) * 1.5));
      }
    }
    const alpha = Math.round(Math.max(body * 0.92, contact) * 255);
    pixels.set([alpha, alpha, alpha, 255], (y * size + x) * 4);
  }
}
const shadowMap = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
shadowMap.magFilter = shadowMap.minFilter = THREE.LinearFilter;
shadowMap.needsUpdate = true;

export class KartShadow extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  private readonly point = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();
  private readonly footprint: Float32Array;

  constructor() {
    const geometry = new THREE.PlaneGeometry(1.88, 2.52, 4, 6);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0x0c1024, alphaMap: shadowMap, transparent: true,
      opacity: 0.58, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    });
    material.userData.outlineParameters = { visible: false };
    super(geometry, material);
    this.name = "kart-contact-shadow";
    this.footprint = new Float32Array(geometry.attributes.position.array);
    (this.geometry.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    this.renderOrder = 1;
    this.frustumCulled = false;
    this.reset();
  }

  reset(): void {
    this.geometry.attributes.position.array.set(this.footprint);
    this.geometry.attributes.position.needsUpdate = true;
    this.position.set(0, 0.018, 0);
    this.material.opacity = 0.58;
    this.visible = true;
  }

  update(state: KartState, root: THREE.Group, terrain?: Pick<KartTrack, "heightAt" | "holeAt">): void {
    this.visible = !state.falling && !(terrain?.holeAt?.(state.pos.x, state.pos.z) ?? false);
    if (!this.visible) return;
    const ground = terrain?.heightAt?.(state.pos.x, state.pos.z) ?? 0;
    const clearance = Math.max(0, state.height - ground);
    const lift = clamp(clearance / 2.5, 0, 1);
    this.material.opacity = 0.58 * (1 - lift * 0.8);
    this.position.set(0, 0, 0);
    root.updateWorldMatrix(true, false);
    this.inverse.copy(root.matrixWorld).invert();
    const positions = this.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      this.point.set(this.footprint[i * 3] * (1 + lift * 0.12), 0, this.footprint[i * 3 + 2] * (1 + lift * 0.12));
      this.point.applyMatrix4(root.matrixWorld);
      // Project vertically, then return to kart-local space: bank and jump rotations
      // must not tilt the shadow away from the surface beneath the vehicle.
      this.point.y = GROUND_Y + (terrain?.heightAt?.(this.point.x, this.point.z) ?? 0) + 0.018;
      this.point.applyMatrix4(this.inverse);
      positions.setXYZ(i, this.point.x, this.point.y, this.point.z);
    }
    positions.needsUpdate = true;
  }
}
