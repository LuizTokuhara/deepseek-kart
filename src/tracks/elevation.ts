import type * as THREE from "three";
import type { TrackElevationPlacement } from "./definition";

/** Maior degrau que um objeto sobe sozinho; menor que o vão entre dois níveis. */
export const LEVEL_STEP = 1.5;
/** Abaixo desta altura o leito conta como chão. */
export const LEVEL_EPSILON = 0.05;

/**
 * Superfície em que algo apoiado em `reference` fica: a mais alta que ele
 * alcança. Sem referência, a mais alta de todas (tabuleiro sobre a estrada).
 */
export function pickLevel(heights: readonly number[], reference = Infinity): number {
  let best = -Infinity;
  let lowest = Infinity;
  for (const height of heights) {
    lowest = Math.min(lowest, height);
    if (height <= reference + LEVEL_STEP && height > best) best = height;
  }
  return best === -Infinity ? lowest : best;
}

/** Ponto do tabuleiro: posição na volta, deslocamento lateral e altura do leito. */
export interface DeckHit {
  readonly t: number;
  readonly lateral: number;
  readonly height: number;
}

interface PathPoint {
  readonly x: number;
  readonly z: number;
}

interface ResolvedElevation {
  readonly from: number;
  readonly span: number;
  readonly ramp: number;
  readonly height: number;
  readonly indices: readonly number[];
  readonly box: { minX: number; maxX: number; minZ: number; maxZ: number };
}

const smooth = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/**
 * Perfil de altura ao longo da volta e consulta dos tabuleiros elevados.
 * Um ponto (x, z) pode ter duas superfícies: a estrada embaixo e o viaduto.
 */
export class ElevationProfile {
  private readonly ranges: ResolvedElevation[] = [];
  private readonly groundSegments: [PathPoint, PathPoint][] = [];
  private readonly length: number;

  /**
   * @param halfWidth meia largura do tabuleiro, até a face externa do parapeito.
   * @param spanClearance distância da estrada de baixo em que o vão fica livre.
   */
  constructor(
    private readonly curve: THREE.Curve<THREE.Vector3>,
    private readonly path: readonly PathPoint[],
    placements: readonly TrackElevationPlacement[],
    readonly halfWidth: number,
    readonly spanClearance: number,
  ) {
    this.length = curve.getLength();
    for (const placement of placements) {
      const span = (((placement.to - placement.from) % 1) + 1) % 1;
      const range = {
        from: placement.from, span, ramp: placement.ramp / this.length,
        height: placement.height, indices: [] as number[],
        box: { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
      };
      path.forEach((point, index) => {
        if (this.offset(range, index / path.length) > span) return;
        range.indices.push(index);
        range.box.minX = Math.min(range.box.minX, point.x - halfWidth - 2);
        range.box.maxX = Math.max(range.box.maxX, point.x + halfWidth + 2);
        range.box.minZ = Math.min(range.box.minZ, point.z - halfWidth - 2);
        range.box.maxZ = Math.max(range.box.maxZ, point.z + halfWidth + 2);
      });
      this.ranges.push(range);
    }
    path.forEach((point, index) => {
      const next = path[(index + 1) % path.length];
      const level = Math.max(this.at(index / path.length), this.at((index + 1) / path.length));
      if (level < LEVEL_EPSILON) this.groundSegments.push([point, next]);
    });
  }

  get active(): boolean {
    return this.ranges.length > 0;
  }

  /** Altura do leito em `t` (0–1), com rampas suaves nas duas pontas. */
  at(t: number): number {
    let height = 0;
    for (const range of this.ranges) {
      const offset = this.offset(range, t);
      if (offset > range.span) continue;
      height = Math.max(height, range.height *
        smooth(offset / range.ramp) * smooth((range.span - offset) / range.ramp));
    }
    return height;
  }

  /** Tabuleiros elevados que cobrem (x, z); a estrada no chão fica de fora. */
  decksAt(x: number, z: number): DeckHit[] {
    const hits: DeckHit[] = [];
    for (const range of this.ranges) {
      const { box } = range;
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
      const t = this.project(range, x, z);
      const offset = this.offset(range, t);
      if (offset <= 0 || offset >= range.span) continue;
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t).normalize();
      const lateral = -(x - point.x) * tangent.z + (z - point.z) * tangent.x;
      const along = (x - point.x) * tangent.x + (z - point.z) * tangent.z;
      const height = this.at(t);
      if (Math.abs(lateral) > this.halfWidth || Math.abs(along) > 0.5 ||
        height < LEVEL_EPSILON) continue;
      hits.push({ t, lateral, height });
    }
    return hits;
  }

  /** Embaixo deste ponto passa a pista no nível do chão: ali o viaduto é vão livre. */
  openBelow(x: number, z: number): boolean {
    const limit = this.spanClearance * this.spanClearance;
    return this.groundSegments.some(([a, b]) => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      return (x - a.x - dx * u) ** 2 + (z - a.z - dz * u) ** 2 < limit;
    });
  }

  /** Distância normalizada desde o início do trecho, atravessando a costura da volta. */
  private offset(range: { from: number }, t: number): number {
    return (((t - range.from) % 1) + 1) % 1;
  }

  /** Projeção contínua na centerline, restrita ao trecho elevado. */
  private project(range: ResolvedElevation, x: number, z: number): number {
    const count = this.path.length;
    let nearest = range.indices[0];
    let best = Infinity;
    for (const index of range.indices) {
      const point = this.path[index];
      const distance = (point.x - x) ** 2 + (point.z - z) ** 2;
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    }
    let t = nearest / count;
    best = Infinity;
    for (const index of [(nearest - 1 + count) % count, nearest]) {
      const a = this.path[index];
      const b = this.path[(index + 1) % count];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const distance = (x - a.x - dx * u) ** 2 + (z - a.z - dz * u) ** 2;
      if (distance < best) {
        best = distance;
        t = ((index + u) / count) % 1;
      }
    }
    for (let iteration = 0; iteration < 3; iteration++) {
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t).normalize();
      const correction = ((x - point.x) * tangent.x + (z - point.z) * tangent.z) / this.length;
      t = ((t + correction) % 1 + 1) % 1;
    }
    return t;
  }
}
