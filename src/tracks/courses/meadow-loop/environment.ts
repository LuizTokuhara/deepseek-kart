import type { EnvironmentDefinition } from "../../../rendering/environment";

export const meadowEnvironment: EnvironmentDefinition = {
  background: 0xafdcec,
  fog: { near: 100, far: 270 },
  ambient: { color: 0xc0d6ed, intensity: 0.35 },
  sun: { color: 0xffedcf, intensity: 2.6, offset: { x: -25, y: 60, z: -20 } },
};
