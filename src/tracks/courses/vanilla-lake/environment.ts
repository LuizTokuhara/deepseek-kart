import type { EnvironmentDefinition } from "../../../rendering/environment";

export const vanillaLakeEnvironment: EnvironmentDefinition = {
  // Neblina azul-gelo em vez de cinza: a neve branca ainda se destaca do fundo.
  background: 0xc6d9e8,
  snowfall: { count: 520, radius: 30 },
  sky: { zenith: 0x6f93b8, ground: 0xc5d5e2, blend: 0.65 },
  // Preserva a leitura dos obstáculos próximos e apaga o outro lado do lago.
  fog: { near: 40, far: 135 },
  // Menos preenchimento e um sol levemente quente dão volume à neve e ao gelo.
  ambient: { color: 0xcadcf0, intensity: 0.36 },
  hemisphere: { sky: 0xdce9f6, ground: 0x9db4cc, intensity: 0.78 },
  sun: {
    color: 0xfff1df,
    intensity: 1.5,
    offset: { x: -42, y: 42, z: 28 },
    shadow: { intensity: 0.6, radius: 3.2 },
  },
};
