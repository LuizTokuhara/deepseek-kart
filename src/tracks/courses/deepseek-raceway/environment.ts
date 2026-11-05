import type { EnvironmentDefinition } from "../../../rendering/environment";

export const racewayEnvironment: EnvironmentDefinition = {
  background: 0x7ccce9,
  sky: { zenith: 0x389ddd, ground: 0x8a7949 },
  fog: { near: 110, far: 300 },
  ambient: { color: 0xc1d4ed, intensity: 0.32 },
  hemisphere: { sky: 0xc7e8ff, ground: 0xa9946b, intensity: 0.72 },
  sun: {
    color: 0xffefd5, intensity: 2.05, offset: { x: -30, y: 62, z: 24 },
    shadow: { intensity: 0.82, radius: 2.2 },
  },
};
