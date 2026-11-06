import type { EnvironmentDefinition } from "../../../rendering/environment";

/**
 * Meia-noite na cidade: céu azul-marinho com estrelas, lua fria fazendo as
 * sombras e brilho alaranjado da cidade no horizonte. A luz quente vem dos
 * postes (decoração da pista), não do ambiente.
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
    // Lua a sudeste, acima dos prédios nas retas para leste e para o sul.
    offset: { x: 55, y: 54, z: -70 },
    shadow: { intensity: 0.55, radius: 2.4 },
  },
};
