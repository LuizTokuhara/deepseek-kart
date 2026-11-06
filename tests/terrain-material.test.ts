import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { terrainMaterial } from "../src/rendering/terrain-material";

/** Runs the material's shader patch against the stock toon program. */
function compile(material: THREE.MeshToonMaterial): THREE.WebGLProgramParametersWithUniforms {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.toon.vertexShader,
    fragmentShader: THREE.ShaderLib.toon.fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

describe("terrainMaterial road edges", () => {
  it("should darken slab road edges using the unit box local x", () => {
    const shader = compile(terrainMaterial(0xeac387, "dirt", { source: "slab", halfWidth: 8 }));

    expect(shader.vertexShader).toContain("vRoadEdge = position.x * 2.0;");
    expect(shader.vertexShader).not.toContain("attribute float roadEdge;");
    expect(shader.fragmentShader).toContain("float roadGutter =");
  });

  it("should read the banked mesh roadEdge attribute", () => {
    const shader = compile(terrainMaterial(0xbf9363, "dirt", { source: "mesh", halfWidth: 8 }));

    expect(shader.vertexShader).toContain("attribute float roadEdge;");
    expect(shader.vertexShader).toContain("vRoadEdge = roadEdge;");
  });

  it("should size the gutter band from the paved half width", () => {
    const shader = compile(terrainMaterial(0x647586, "asphalt", { source: "slab", halfWidth: 8 }));

    expect(shader.uniforms.roadGutterBand.value).toBeCloseTo(2 / 8);
  });

  it("should frost ice road edges instead of darkening them", () => {
    const shader = compile(terrainMaterial(0x94d3e6, "ice", { source: "mesh", halfWidth: 8.5 }));

    expect(shader.fragmentShader).toContain("abs(vRoadEdge)");
    expect(shader.fragmentShader).not.toContain("float roadGutter =");
  });

  it("should keep off-road terrain free of road edge effects", () => {
    const shader = compile(terrainMaterial(0x7cbc62, "grass"));

    expect(shader.vertexShader).not.toContain("vRoadEdge");
    expect(shader.fragmentShader).not.toContain("float roadGutter =");
    expect(shader.fragmentShader).toContain("terrainMacroStrength");
  });

  it("should give programs with different edge sources different cache keys", () => {
    const slab = terrainMaterial(0xeac387, "dirt", { source: "slab", halfWidth: 8 });
    const mesh = terrainMaterial(0xeac387, "dirt", { source: "mesh", halfWidth: 8 });
    const plain = terrainMaterial(0xeac387, "dirt");

    const keys = new Set([slab, mesh, plain].map((m) => m.customProgramCacheKey()));

    expect(keys.size).toBe(3);
  });
});
