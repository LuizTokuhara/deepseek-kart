import type { EnvironmentDefinition } from "../../../rendering/environment";

export const vanillaLakeEnvironment: EnvironmentDefinition = {
  // Ice-blue fog instead of gray: the white snow still stands out from the background.
  background: 0xc6d9e8,
  // More contrast and cold shadows: the snow no longer looks washed out.
  grade: {
    contrast: 1.16, saturation: 1.12,
    shadowTint: 0xdde6ff, highlightTint: 0xfffaf2, vignette: 0.14,
  },
  snowfall: { count: 520, radius: 30 },
  sky: { zenith: 0x6f93b8, ground: 0xc5d5e2, blend: 0.65 },
  // Preserves the readability of nearby obstacles and fades out the far side of the lake.
  fog: { near: 40, far: 135 },
  // Less fill light and a slightly warm sun give volume to the snow and ice.
  ambient: { color: 0xcadcf0, intensity: 0.36 },
  hemisphere: { sky: 0xdce9f6, ground: 0x9db4cc, intensity: 0.78 },
  sun: {
    color: 0xfff1df,
    intensity: 1.5,
    offset: { x: -42, y: 42, z: 28 },
    shadow: { intensity: 0.6, radius: 3.2 },
  },
};
