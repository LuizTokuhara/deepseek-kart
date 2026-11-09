import { fractalNoise2D } from "../core/noise";

/** Soft relief outside the track corridor; purely visual. */
export interface TerrainRelief {
  /** Maximum height variation, in meters (up and down). */
  readonly amplitude: number;
  /** Typical size of an undulation, in meters. */
  readonly wavelength: number;
  /** Distance from the centerline over which the ground is still flat. */
  readonly clearance: number;
  /** Band after `clearance` where the relief fades in gradually. */
  readonly blend: number;
}

/** Visual ground beyond the map bounds, rising to close off the horizon. */
export interface TerrainSkirt {
  /** Width of the band beyond the bounds, in meters. */
  readonly width: number;
  /** Average height at the outer edge, in meters. */
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

/** Mesh spacing on the skirt, where the ground is far from the camera. */
const SKIRT_STEP = 8;

const smoothStep = (from: number, to: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** Distance from (x, z) to the closed centerline polyline. */
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
 * Shape of the visual ground: undulations outside the corridor and a skirt beyond
 * the bounds. Physics and AI still use only the track height.
 */
export class GroundShape {
  constructor(
    private readonly path: readonly Point2[],
    private readonly bounds: Bounds,
    private readonly relief?: TerrainRelief,
    private readonly skirt?: TerrainSkirt,
  ) {}

  /** Height added to the base terrain at (x, z). */
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

  /** How far (x, z) lies beyond the map bounds; 0 inside them. */
  outsideDistance(x: number, z: number): number {
    const b = this.bounds;
    return Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
  }

  /** Mesh lines along one axis: `segments` within the bounds and a wide step on the skirt. */
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
