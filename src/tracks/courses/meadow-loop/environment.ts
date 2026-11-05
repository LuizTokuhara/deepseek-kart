import type { EnvironmentDefinition } from "../../../rendering/environment";

export const meadowEnvironment: EnvironmentDefinition = {
  background: 0xafdcec,
  sky: { zenith: 0x589dd5, ground: 0x678750 },
  fog: { near: 100, far: 270 },
  ambient: { color: 0xc8d9ee, intensity: 0.3 },
  hemisphere: { sky: 0xd0eaff, ground: 0x92a272, intensity: 0.65 },
  sun: {
    color: 0xfff0db, intensity: 2.05, offset: { x: -25, y: 64, z: -20 },
    shadow: { intensity: 0.84, radius: 2 },
  },
};
