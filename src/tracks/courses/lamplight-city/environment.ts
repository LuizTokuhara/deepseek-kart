import type { EnvironmentDefinition } from "../../../rendering/environment";

/**
 * Midnight in the city: navy-blue sky with stars, a cold moon casting the
 * shadows, and an orange city glow on the horizon. The warm light comes from the
 * lamps (track decoration), not from the environment.
 */
export const lamplightCityEnvironment: EnvironmentDefinition = {
  background: 0x1c2244,
  headlights: true,
  grade: {
    contrast: 1.1, saturation: 1.12,
    shadowTint: 0xd6dcff, highlightTint: 0xfff0dc, vignette: 0.22,
  },
  sky: { zenith: 0x04060f, ground: 0x2a2734, blend: 0.45, cloudCover: 0.7, stars: 1,
    haze: 0x5e4660 },
  fog: { near: 60, far: 300 },
  ambient: { color: 0x7a88c2, intensity: 0.22 },
  hemisphere: { sky: 0x4f61a0, ground: 0x2c2733, intensity: 0.6 },
  sun: {
    color: 0xb3c5ff,
    intensity: 0.9,
    // Moon to the southeast, above the buildings on the east and south straights.
    offset: { x: 55, y: 54, z: -70 },
    shadow: { intensity: 0.55, radius: 2.4 },
  },
};
