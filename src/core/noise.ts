/** Hash inteiro → [0, 1), estável entre execuções e plataformas. */
function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number): number => t * t * (3 - 2 * t);

/**
 * Ruído de valor 2D suave em [0, 1), com uma célula por unidade.
 * Escale as coordenadas para escolher o tamanho das manchas.
 */
export function valueNoise2D(x: number, z: number, seed = 0): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fz = fade(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Duas oitavas de ruído de valor, ainda em [0, 1). */
export function fractalNoise2D(x: number, z: number, seed = 0): number {
  const coarse = valueNoise2D(x, z, seed);
  const fine = valueNoise2D(x * 2.13 + 17.1, z * 2.13 - 9.4, seed + 1);
  return coarse * 0.67 + fine * 0.33;
}
