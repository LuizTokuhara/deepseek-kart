import type { EnvironmentDefinition } from "../../../rendering/environment";

export const vanillaLakeEnvironment: EnvironmentDefinition = {
  background: 0xd5dfe5,
  snowfall: { count: 520, radius: 30 },
  sky: { zenith: 0x8c9fae, ground: 0xc5d5e2 },
  // Preserva a leitura dos obstáculos próximos e apaga o outro lado do lago.
  fog: { near: 26, far: 110 },
  ambient: { color: 0xd5e3ef, intensity: 0.46 },
  hemisphere: { sky: 0xe5eff7, ground: 0xacbfd2, intensity: 0.86 },
  sun: {
    color: 0xdce9f5,
    intensity: 1.25,
    offset: { x: -42, y: 42, z: 28 },
    shadow: { intensity: 0.42, radius: 4.0 },
  },
};
