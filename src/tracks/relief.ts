import { fractalNoise2D } from "../core/noise";

/** Relevo suave fora do corredor da pista; puramente visual. */
export interface TerrainRelief {
  /** Variação máxima de altura, em metros (para cima e para baixo). */
  readonly amplitude: number;
  /** Tamanho típico de uma ondulação, em metros. */
  readonly wavelength: number;
  /** Distância da centerline em que o chão ainda é plano. */
  readonly clearance: number;
  /** Faixa, depois de `clearance`, em que o relevo entra aos poucos. */
  readonly blend: number;
}

/** Chão visual além dos limites do mapa, subindo para fechar o horizonte. */
export interface TerrainSkirt {
  /** Largura da faixa além dos limites, em metros. */
  readonly width: number;
  /** Altura média na borda externa, em metros. */
  readonly rise: number;
}

interface Point2 {
  readonly x: number;
  readonly z: number;
}

interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Espaçamento da malha na saia, onde o chão está longe da câmera. */
const SKIRT_STEP = 8;

const smoothStep = (from: number, to: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** Distância de (x, z) até a polilinha fechada da centerline. */
export function pathDistance(path: readonly Point2[], x: number, z: number): number {
  let best = Infinity;
  for (let index = 0; index < path.length; index++) {
    const a = path[index];
    const b = path[(index + 1) % path.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const along = ((x - a.x) * dx + (z - a.z) * dz) / Math.max(dx * dx + dz * dz, 1e-6);
    const u = Math.max(0, Math.min(1, along));
    const ex = x - a.x - dx * u;
    const ez = z - a.z - dz * u;
    best = Math.min(best, ex * ex + ez * ez);
  }
  return Math.sqrt(best);
}

/**
 * Forma do chão visual: ondulações fora do corredor e uma saia além dos
 * limites. Física e IA continuam usando só a altura da pista.
 */
export class GroundShape {
  constructor(
    private readonly path: readonly Point2[],
    private readonly bounds: Bounds,
    private readonly relief?: TerrainRelief,
    private readonly skirt?: TerrainSkirt,
  ) {}

  /** Altura somada ao terreno base em (x, z). */
  offsetAt(x: number, z: number): number {
    let height = 0;
    const relief = this.relief;
    if (relief) {
      const distance = pathDistance(this.path, x, z);
      const weight = smoothStep(relief.clearance, relief.clearance + relief.blend, distance);
      if (weight > 0) {
        const noise = fractalNoise2D(x / relief.wavelength, z / relief.wavelength, 31);
        height += (noise - 0.5) * 2 * relief.amplitude * weight;
      }
    }
    const outside = this.outsideDistance(x, z);
    if (this.skirt && outside > 0) {
      const t = Math.min(1, outside / this.skirt.width);
      height += this.skirt.rise * t * t * (0.55 + 0.9 * fractalNoise2D(x / 45, z / 45, 77));
    }
    return height;
  }

  /** Quanto (x, z) está além dos limites do mapa; 0 dentro deles. */
  outsideDistance(x: number, z: number): number {
    const b = this.bounds;
    return Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
  }

  /** Linhas da malha num eixo: `segments` dentro dos limites e passo largo na saia. */
  gridLines(min: number, max: number, segments: number): number[] {
    const lines: number[] = [];
    const width = this.skirt?.width ?? 0;
    const outer = Math.ceil(width / SKIRT_STEP);
    for (let index = outer; index > 0; index--) lines.push(min - (index * width) / outer);
    for (let index = 0; index <= segments; index++) {
      lines.push(min + ((max - min) * index) / segments);
    }
    for (let index = 1; index <= outer; index++) lines.push(max + (index * width) / outer);
    return lines;
  }
}
