import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BLOOM_THRESHOLD, linearLuminance } from "../src/rendering/glow";
import { Sky } from "../src/rendering/sky";

const options = {
  zenith: 0x389ddd,
  horizon: 0x7ccce9,
  sunDirection: new THREE.Vector3(-30, 62, 24),
  sunColor: 0xffbb75,
};

function uniform<T>(sky: Sky, name: string): T {
  return sky.mesh.material.uniforms[name].value as T;
}

describe("Sky", () => {
  it("should give the sun disc enough HDR energy to bloom", () => {
    const sky = new Sky(options);

    expect(linearLuminance(uniform<THREE.Color>(sky, "sunDisc"))).toBeGreaterThan(BLOOM_THRESHOLD);
  });

  it("should normalize the sun direction for the halo and disc", () => {
    const sky = new Sky(options);

    expect(uniform<THREE.Vector3>(sky, "sunDirection").length()).toBeCloseTo(1);
  });

  it("should keep the horizon haze lighter than the fog-matched horizon", () => {
    const sky = new Sky(options);

    expect(linearLuminance(uniform<THREE.Color>(sky, "haze")))
      .toBeGreaterThan(linearLuminance(uniform<THREE.Color>(sky, "horizon")));
  });

  it("should tint lit cloud tops with the sun colour", () => {
    const sky = new Sky(options);
    const lit = uniform<THREE.Color>(sky, "cloudLit");

    // Orange sun: warmer red than blue on the lit side.
    expect(lit.r).toBeGreaterThan(lit.b);
  });

  it("should accept a per-course cloud cover", () => {
    const sky = new Sky({ ...options, cloudCover: 0.75 });

    expect(uniform<number>(sky, "cloudCover")).toBe(0.75);
  });

  it("should drift the clouds over time", () => {
    const sky = new Sky(options);

    sky.update(1, false);

    expect(uniform<THREE.Vector2>(sky, "cloudOffset").length()).toBeGreaterThan(0);
  });

  it("should freeze the clouds when the player prefers reduced motion", () => {
    const sky = new Sky(options);

    sky.update(1, true);

    expect(uniform<THREE.Vector2>(sky, "cloudOffset").length()).toBe(0);
  });
});
