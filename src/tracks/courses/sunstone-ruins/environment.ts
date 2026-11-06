import type { EnvironmentDefinition } from "../../../rendering/environment";

export const sunstoneRuinsEnvironment: EnvironmentDefinition = {
  background: 0xf2ac70,
  // Pôr do sol: realces quentes e sombras lavanda, com um pouco mais de contraste.
  grade: {
    contrast: 1.08, saturation: 1.05,
    shadowTint: 0xe2dcff, highlightTint: 0xfff1df, vignette: 0.14,
  },
  // Late desert sunset: dusk-violet zenith over apricot haze, a low amber key
  // light and lavender fill, so shaded sand reads cool against the lit dunes.
  sky: { zenith: 0x6d6aa8, ground: 0x956447, blend: 0.55 },
  fog: { near: 75, far: 240 },
  ambient: { color: 0xc4b6dc, intensity: 0.34 },
  hemisphere: { sky: 0xd4bfe2, ground: 0x87634f, intensity: 0.62 },
  sun: {
    color: 0xffbb75,
    intensity: 1.85,
    offset: { x: -58, y: 19, z: 22 },
    shadow: { intensity: 0.76, radius: 2.8 },
  },
};
