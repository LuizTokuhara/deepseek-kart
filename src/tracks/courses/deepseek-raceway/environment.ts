import type { EnvironmentDefinition } from "../../../rendering/environment";

export const racewayEnvironment: EnvironmentDefinition = {
  background: 0x7ccce9,
  fog: { near: 110, far: 300 },
  ambient: { color: 0xa6baff, intensity: 0.28 },
  sun: { color: 0xfff3de, intensity: 2.8, offset: { x: -35, y: 55, z: 25 } },
};
