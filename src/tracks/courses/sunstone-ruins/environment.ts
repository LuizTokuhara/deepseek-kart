import type { EnvironmentDefinition } from "../../../rendering/environment";

export const sunstoneRuinsEnvironment: EnvironmentDefinition = {
  background: 0xf2ac70,
  // Late desert sunset: copper sky, apricot haze and a low amber key light.
  sky: { zenith: 0xc96449, ground: 0x956447, blend: 0.5 },
  fog: { near: 75, far: 240 },
  ambient: { color: 0xe3b9ad, intensity: 0.36 },
  hemisphere: { sky: 0xffc995, ground: 0x87634f, intensity: 0.64 },
  sun: {
    color: 0xffbb75,
    intensity: 1.75,
    offset: { x: -58, y: 19, z: 22 },
    shadow: { intensity: 0.76, radius: 2.8 },
  },
};
