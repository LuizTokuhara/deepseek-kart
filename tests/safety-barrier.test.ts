import * as THREE from "three/webgpu";
import { describe, expect, it } from "vitest";
import {
  BARRIER_BLOCK_LENGTH,
  safetyBarrierGeometry,
  safetyBarrierMaterial,
} from "../src/decor/race/safety-barrier";

describe("safety barrier block", () => {
  it("is modeled at its real width and height, centered on its origin", () => {
    const geometry = safetyBarrierGeometry(0.6, 1.2);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
    expect(size.x).toBeCloseTo(0.6, 5);
    expect(size.y).toBeCloseTo(1.2, 5);
    expect(size.z).toBeCloseTo(BARRIER_BLOCK_LENGTH, 5);
    expect(center.length()).toBeLessThan(1e-6);
  });

  it("keeps the cel paint color and shades it from the foot up", () => {
    const material = safetyBarrierMaterial(0x438df0, 1.2);
    expect(material).toBeInstanceOf(THREE.MeshToonNodeMaterial);
    expect(material.color.getHex()).toBe(0x438df0);
    expect(material.colorNode).not.toBeNull();
  });
});
