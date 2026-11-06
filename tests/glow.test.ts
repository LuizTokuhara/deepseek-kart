import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  BLOOM_KNEE,
  BLOOM_THRESHOLD,
  GLOW_LUMINANCE,
  glowColor,
  linearLuminance,
} from "../src/rendering/glow";
import { courses } from "../src/tracks/registry";

/** Brightest band of the scenery toon ramp (245 / 255). */
const TOON_PEAK = 245 / 255;

describe("glowColor", () => {
  it("should lift every emissive hue past the bloom threshold and knee", () => {
    // Arrange: lava, boost tiers, start lights and torch colors in use.
    const hues = [0xff6b27, 0xffce68, 0x38bdf8, 0xfb923c, 0xc084fc, 0xff3b30, 0x4ade80, 0xffc15c];

    for (const hex of hues) {
      // Act
      const color = glowColor(hex);

      // Assert
      expect(linearLuminance(color)).toBeCloseTo(GLOW_LUMINANCE, 5);
      expect(linearLuminance(color)).toBeGreaterThan(BLOOM_THRESHOLD + BLOOM_KNEE);
    }
  });

  it("should keep the paint hue when scaling into HDR", () => {
    const base = new THREE.Color(0xff6b27);

    const glowing = glowColor(0xff6b27, 1.9);

    const scale = glowing.r / base.r;
    expect(glowing.g / base.g).toBeCloseTo(scale, 5);
    expect(glowing.b / base.b).toBeCloseTo(scale, 5);
  });

  it("should write into the provided target color", () => {
    const target = new THREE.Color();

    const result = glowColor(0x4ade80, GLOW_LUMINANCE, target);

    expect(result).toBe(target);
  });

  it("should leave black untouched instead of dividing by zero", () => {
    const color = glowColor(0x000000);

    expect(color.toArray()).toEqual([0, 0, 0]);
  });
});

describe("bloom threshold", () => {
  it("should keep fully lit white scenery paint below the threshold on every course", () => {
    for (const course of courses) {
      const { sun, hemisphere, ambient } = course.environment;
      // Toon lighting is Lambert (albedo / PI) with the ramp applied to the sun only.
      const peak = (sun.intensity * TOON_PEAK + (hemisphere?.intensity ?? 0.38) +
        ambient.intensity) / Math.PI;

      expect(peak, course.layout.id).toBeLessThan(BLOOM_THRESHOLD);
    }
  });
});
