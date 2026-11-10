import * as THREE from "three/webgpu";
import { describe, expect, it } from "vitest";
import { terrainMaterial } from "../src/rendering/terrain-material";
import { createWetReflections } from "../src/rendering/wet-reflections";

describe("wet surfaces", () => {
  it("soaks the terrain only when the course asks for it", () => {
    const dry = terrainMaterial(0x70737d, "asphalt", { source: "slab", halfWidth: 7 });
    const wet = terrainMaterial(0x70737d, "asphalt", { source: "slab", halfWidth: 7 }, {
      sheen: 0x6a5c8e,
    });
    expect(dry.userData.terrain.wet).toBe(false);
    expect(dry.emissiveNode).toBeNull();
    expect(wet.userData.terrain.wet).toBe(true);
    expect(wet.emissiveNode).not.toBeNull();
  });

  it("builds one camera-facing ground quad per reflected light", () => {
    const mesh = createWetReflections([
      { position: new THREE.Vector3(1, 6, 2), groundY: 0.08, color: 0xffb062, width: 0.9, intensity: 0.8 },
      { position: new THREE.Vector3(-4, 4.5, 9), groundY: 0.08, color: 0x38e8ff, width: 1.2, intensity: 0.7 },
    ]);
    const { geometry } = mesh;
    expect(geometry.getAttribute("position").count).toBe(8);
    expect(geometry.getIndex()!.count).toBe(12);
    expect(Array.from(geometry.getAttribute("light").array.slice(0, 3))).toEqual([1, 6, 2]);
    expect(geometry.getAttribute("streakWidth").getX(4)).toBeCloseTo(1.2);
    // Placement happens on the GPU, so CPU bounds would cull visible streaks.
    expect(mesh.frustumCulled).toBe(false);
    const material = mesh.material as THREE.MeshBasicNodeMaterial;
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.depthWrite).toBe(false);
  });
});
