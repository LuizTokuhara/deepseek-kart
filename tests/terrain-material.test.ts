import { describe, expect, it } from "vitest";
import { terrainMaterial } from "../src/rendering/terrain-material";

interface TerrainMetadata {
  kind: string;
  edge: "slab" | "mesh" | null;
  gutterBand: number;
  edgeFrost: boolean;
}

function metadata(material: ReturnType<typeof terrainMaterial>): TerrainMetadata {
  return material.userData.terrain as TerrainMetadata;
}

describe("terrainMaterial road edges", () => {
  it("should darken slab road edges using the unit box local x", () => {
    const material = terrainMaterial(0xeac387, "dirt", { source: "slab", halfWidth: 8 });

    expect(metadata(material).edge).toBe("slab");
    expect(material.colorNode).toBeTruthy();
  });

  it("should read the banked mesh roadEdge attribute", () => {
    const material = terrainMaterial(0xbf9363, "dirt", { source: "mesh", halfWidth: 8 });

    expect(metadata(material).edge).toBe("mesh");
  });

  it("should size the gutter band from the paved half width", () => {
    const material = terrainMaterial(0x647586, "asphalt", { source: "slab", halfWidth: 8 });

    expect(metadata(material).gutterBand).toBeCloseTo(2 / 8);
  });

  it("should frost ice road edges instead of darkening them", () => {
    const material = terrainMaterial(0x94d3e6, "ice", { source: "mesh", halfWidth: 8.5 });

    expect(metadata(material).edgeFrost).toBe(true);
  });

  it("should keep off-road terrain free of road edge effects", () => {
    const material = terrainMaterial(0x7cbc62, "grass");

    expect(metadata(material).edge).toBeNull();
    expect(metadata(material).edgeFrost).toBe(false);
  });

  it("should keep edge sources distinguishable", () => {
    const slab = terrainMaterial(0xeac387, "dirt", { source: "slab", halfWidth: 8 });
    const mesh = terrainMaterial(0xeac387, "dirt", { source: "mesh", halfWidth: 8 });
    const plain = terrainMaterial(0xeac387, "dirt");

    const keys = new Set([slab, mesh, plain].map((material) => JSON.stringify(metadata(material))));

    expect(keys.size).toBe(3);
  });
});
