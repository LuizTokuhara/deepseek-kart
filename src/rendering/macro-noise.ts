import * as THREE from "three";

const SIZE = 64;
/** Lattice cells per tile for each octave, with its weight. */
const OCTAVES = [
  { cells: 4, weight: 0.65 },
  { cells: 8, weight: 0.35 },
] as const;

let noiseTexture: THREE.DataTexture | undefined;

/** Smooth, tileable value noise for one octave at texel (x, y). */
function octave(lattice: Float32Array, cells: number, x: number, y: number): number {
  const at = (cx: number, cy: number): number =>
    lattice[(cy % cells) * cells + (cx % cells)];
  const fx = (x / SIZE) * cells;
  const fy = (y / SIZE) * cells;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = THREE.MathUtils.smoothstep(fx - x0, 0, 1);
  const ty = THREE.MathUtils.smoothstep(fy - y0, 0, 1);
  const top = THREE.MathUtils.lerp(at(x0, y0), at(x0 + 1, y0), tx);
  const bottom = THREE.MathUtils.lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx);
  return THREE.MathUtils.lerp(top, bottom, ty);
}

/**
 * Soft blotches (0..1, centered on 0.5) for large-scale tone variation on
 * terrain. Sampled at low frequency in world space, it hides the short period
 * of the painted detail patterns. Generated once and shared.
 */
export function macroNoiseTexture(): THREE.DataTexture {
  if (noiseTexture) return noiseTexture;
  let seed = 92821;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const lattices = OCTAVES.map(({ cells }) =>
    Float32Array.from({ length: cells * cells }, random));

  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let value = 0;
      OCTAVES.forEach(({ cells, weight }, index) => {
        value += octave(lattices[index], cells, x, y) * weight;
      });
      const i = (y * SIZE + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(value * 255);
      data[i + 3] = 255;
    }
  }

  noiseTexture = new THREE.DataTexture(data, SIZE, SIZE);
  noiseTexture.name = "terrain-macro-noise";
  noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
  noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTexture.generateMipmaps = true;
  noiseTexture.needsUpdate = true;
  return noiseTexture;
}
