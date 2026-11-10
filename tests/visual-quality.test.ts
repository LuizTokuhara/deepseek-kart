import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildBuildings } from "../src/decor/city/buildings";
import { buildClouds } from "../src/decor/nature/clouds";
import { Environment } from "../src/rendering/environment";
import { AdaptiveResolution } from "../src/rendering/adaptive-resolution";
import {
  createVisualQuality,
  qualityPresetFor,
} from "../src/core/visual-quality";
import { vanillaLakeEnvironment } from "../src/tracks/courses/vanilla-lake/environment";

describe("visual quality profile", () => {
  it("uses the mobile preset automatically and allows URL overrides", () => {
    expect(qualityPresetFor("", false)).toBe("high");
    expect(qualityPresetFor("", true)).toBe("low");
    expect(qualityPresetFor("?quality=high", true)).toBe("high");
    expect(qualityPresetFor("?quality=low", false)).toBe("low");
    expect(qualityPresetFor("?track=meadow-loop&quality=low", false)).toBe("low");
  });

  it("trades visual density and expensive passes for mobile headroom", () => {
    const high = createVisualQuality("high");
    const low = createVisualQuality("low");

    expect(low.sceneryDensity).toBeLessThan(high.sceneryDensity);
    expect(low.backdropPeaks).toBeLessThan(high.backdropPeaks);
    expect(low.cloudDensity).toBeLessThan(high.cloudDensity);
    expect(low.snowfallDensity).toBeLessThan(high.snowfallDensity);
    expect(low.buildingDetail).toBeLessThan(high.buildingDetail);
    expect(low.lightRigCount).toBeLessThan(high.lightRigCount);
    expect(low.shadowMapSize).toBeLessThan(high.shadowMapSize);
    expect(low.msaa).toBeLessThan(high.msaa);
    expect(low.ambientOcclusion).toBe(false);
    expect(low.pixelBudget).toBeLessThan(high.pixelBudget);
    expect(low.maxPixelRatio).toBeLessThan(high.maxPixelRatio);
  });
});

describe("low-quality scene construction", () => {
  it("reduces clouds without changing their placement rules", () => {
    const spots = Array.from({ length: 30 }, (_, index) => ({
      x: index,
      y: 30,
      z: -index,
      scale: 3,
    }));
    const high = new THREE.Group();
    const low = new THREE.Group();
    buildClouds(spots, high, createVisualQuality("high"));
    buildClouds(spots, low, createVisualQuality("low"));

    const highClouds = high.children[0] as THREE.InstancedMesh;
    const lowClouds = low.children[0] as THREE.InstancedMesh;
    expect(highClouds.count).toBe(30);
    expect(lowClouds.count).toBeLessThan(highClouds.count);
  });

  it("keeps building entrances but removes most facade relief", () => {
    const lot = {
      x: 0, z: 0, yaw: 0, width: 14, depth: 12, height: 32,
      kind: "office" as const, color: 0x8a96a6, lit: 0.4, seed: 17,
    };
    const full = buildBuildings([lot], { detail: 1 });
    const low = buildBuildings([lot], { detail: 0.25 });
    const fullRelief = full.group.getObjectByName("building-facade-relief") as THREE.InstancedMesh;
    const lowRelief = low.group.getObjectByName("building-facade-relief") as THREE.InstancedMesh;
    const fullGlass = full.group.getObjectByName("building-door-glass") as THREE.InstancedMesh;
    const lowGlass = low.group.getObjectByName("building-door-glass") as THREE.InstancedMesh;

    expect(lowRelief.count).toBeLessThan(fullRelief.count);
    expect(lowGlass.count).toBe(fullGlass.count);
    expect(lowGlass.count).toBeGreaterThan(0);
  });

  it("shrinks the shadow map and snowfall volume", () => {
    const highScene = new THREE.Scene();
    const lowScene = new THREE.Scene();
    const high = new Environment(
      highScene,
      vanillaLakeEnvironment,
      createVisualQuality("high"),
    );
    new Environment(lowScene, vanillaLakeEnvironment, createVisualQuality("low"));

    expect(high.sun.shadow.mapSize.x).toBe(2048);
    const lowSnow = lowScene.getObjectByName("winter-snowfall") as THREE.InstancedMesh;
    const highSnow = highScene.getObjectByName("winter-snowfall") as THREE.InstancedMesh;
    expect(lowSnow.count).toBeLessThan(highSnow.count);
  });

  it("caps mobile's initial drawing buffer below the desktop budget", () => {
    const high = new AdaptiveResolution({
      initialPixelBudget: 1920 * 1080,
      maximumPixelRatio: 2,
    });
    const low = new AdaptiveResolution({
      initialPixelBudget: 1280 * 720,
      maximumPixelRatio: 1.5,
    });
    const highRatio = high.configure(844, 390, 3);
    const lowRatio = low.configure(844, 390, 3);

    expect(lowRatio).toBeLessThan(highRatio);
    expect(low.nativePixelRatio).toBe(1.5);
  });
});
