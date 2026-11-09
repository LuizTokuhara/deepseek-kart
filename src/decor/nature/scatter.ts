import * as THREE from "three";
import { worldToLocal2D } from "../../core/math";
import type { ColliderBox } from "../../core/types";
import { pathDistance } from "../../tracks/relief";
import type { TrackLike } from "../../tracks/track";
import { randomGenerator } from "../common";

export interface ScatterArea {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface ScatterPoint {
  readonly x: number;
  readonly z: number;
}

/**
 * Distance to the centerline sampled on a coarse grid: thousands of queries
 * per track without walking the whole polyline for every point.
 */
export class RoadDistanceField {
  private readonly values: Float32Array;
  private readonly columns: number;
  private readonly rows: number;
  private readonly minX: number;
  private readonly minZ: number;

  constructor(track: TrackLike, private readonly cell = 2) {
    const { minX, maxX, minZ, maxZ } = track.bounds;
    this.columns = Math.ceil((maxX - minX) / cell) + 1;
    this.rows = Math.ceil((maxZ - minZ) / cell) + 1;
    this.minX = minX;
    this.minZ = minZ;
    this.values = new Float32Array(this.columns * this.rows);
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        this.values[row * this.columns + column] =
          pathDistance(track.path, minX + column * cell, minZ + row * cell);
      }
    }
  }

  /** Interpolated distance; outside the grid, it uses the nearest edge. */
  at(x: number, z: number): number {
    const gx = Math.max(0, Math.min(this.columns - 1.001, (x - this.minX) / this.cell));
    const gz = Math.max(0, Math.min(this.rows - 1.001, (z - this.minZ) / this.cell));
    const column = Math.floor(gx);
    const row = Math.floor(gz);
    const fx = gx - column;
    const fz = gz - row;
    const index = row * this.columns + column;
    const top = this.values[index] * (1 - fx) + this.values[index + 1] * fx;
    const bottom = this.values[index + this.columns] * (1 - fx) +
      this.values[index + this.columns + 1] * fx;
    return top * (1 - fz) + bottom * fz;
  }
}

/**
 * One candidate per `spacing`-meter cell, randomly offset, accepted with
 * probability `density`. Covers the area without clumps or a grid pattern.
 */
export function scatterPoints(
  area: ScatterArea,
  spacing: number,
  seed: number,
  density: (x: number, z: number) => number,
): ScatterPoint[] {
  const random = randomGenerator(seed);
  const points: ScatterPoint[] = [];
  for (let z = area.minZ; z < area.maxZ; z += spacing) {
    for (let x = area.minX; x < area.maxX; x += spacing) {
      const px = x + random() * spacing;
      const pz = z + random() * spacing;
      const roll = random();
      if (roll < density(px, pz)) points.push({ x: px, z: pz });
    }
  }
  return points;
}

/** Resolution of the exclusion mask, in meters per cell. */
const MASK_CELL = 0.5;

/**
 * Grid of areas forbidden to vegetation. Level 2 blocks everything (floor,
 * water, building interiors); level 1 only blocks solid pieces, such as bushes
 * and pebbles, which need clearance around the colliders.
 */
export class ExclusionMask {
  private readonly cells: Uint8Array;
  private readonly columns: number;
  private readonly rows: number;

  constructor(private readonly area: ScatterArea) {
    this.columns = Math.ceil((area.maxX - area.minX) / MASK_CELL) + 1;
    this.rows = Math.ceil((area.maxZ - area.minZ) / MASK_CELL) + 1;
    this.cells = new Uint8Array(this.columns * this.rows);
  }

  /** 0 free, 1 solids-free only, 2 nothing spawns here. */
  level(x: number, z: number): number {
    const column = Math.floor((x - this.area.minX) / MASK_CELL);
    const row = Math.floor((z - this.area.minZ) / MASK_CELL);
    if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) return 0;
    return this.cells[row * this.columns + column];
  }

  /** Blocks the collider (level 2) and extra clearance around it (level 1). */
  addColliders(colliders: readonly ColliderBox[], solidMargin: number): void {
    for (const box of colliders) {
      const reach = Math.hypot(box.half.x, box.half.z) + solidMargin;
      this.fill(box.center.x - reach, box.center.z - reach, box.center.x + reach,
        box.center.z + reach, (x, z) => {
          const local = worldToLocal2D(x - box.center.x, z - box.center.z, box.yaw);
          const outside = Math.max(Math.abs(local.x) - box.half.x, Math.abs(local.z) - box.half.z);
          return outside < 0.1 ? 2 : outside < solidMargin ? 1 : 0;
        });
    }
  }

  /**
   * Blocks the plan-view footprint of every ground-level piece under `root`:
   * floor, sand, water and beds, where grass would pierce the surface.
   */
  addFlatFootprints(root: THREE.Object3D, maxHeight = 0.3): void {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const instance = new THREE.Matrix4();
    const world = new THREE.Matrix4();
    const triangle = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry as THREE.BufferGeometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const position = geometry.getAttribute("position");
      const index = geometry.getIndex();
      const count = object instanceof THREE.InstancedMesh ? object.count : 1;
      for (let item = 0; item < count; item++) {
        world.copy(object.matrixWorld);
        if (object instanceof THREE.InstancedMesh) {
          object.getMatrixAt(item, instance);
          world.multiply(instance);
        }
        box.copy(geometry.boundingBox!).applyMatrix4(world);
        if (box.max.y > maxHeight || box.max.y < -1) continue;
        const corners = index ? index.count : position.count;
        for (let vertex = 0; vertex + 2 < corners; vertex += 3) {
          for (let corner = 0; corner < 3; corner++) {
            const at = index ? index.getX(vertex + corner) : vertex + corner;
            triangle[corner].fromBufferAttribute(position, at).applyMatrix4(world);
          }
          this.fillTriangle(triangle[0], triangle[1], triangle[2]);
        }
      }
    });
  }

  private fillTriangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
    const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
    if (Math.abs(area) < 1e-6) return;
    const pad = MASK_CELL * 0.5;
    this.fill(Math.min(a.x, b.x, c.x) - pad, Math.min(a.z, b.z, c.z) - pad,
      Math.max(a.x, b.x, c.x) + pad, Math.max(a.z, b.z, c.z) + pad, (x, z) => {
        const w0 = ((b.x - x) * (c.z - z) - (c.x - x) * (b.z - z)) / area;
        const w1 = ((c.x - x) * (a.z - z) - (a.x - x) * (c.z - z)) / area;
        const edge = -0.08;
        return w0 >= edge && w1 >= edge && 1 - w0 - w1 >= edge ? 2 : 0;
      });
  }

  private fill(
    minX: number, minZ: number, maxX: number, maxZ: number,
    levelAt: (x: number, z: number) => number,
  ): void {
    const fromColumn = Math.max(0, Math.floor((minX - this.area.minX) / MASK_CELL));
    const toColumn = Math.min(this.columns - 1, Math.floor((maxX - this.area.minX) / MASK_CELL));
    const fromRow = Math.max(0, Math.floor((minZ - this.area.minZ) / MASK_CELL));
    const toRow = Math.min(this.rows - 1, Math.floor((maxZ - this.area.minZ) / MASK_CELL));
    for (let row = fromRow; row <= toRow; row++) {
      for (let column = fromColumn; column <= toColumn; column++) {
        const x = this.area.minX + (column + 0.5) * MASK_CELL;
        const z = this.area.minZ + (row + 0.5) * MASK_CELL;
        const index = row * this.columns + column;
        this.cells[index] = Math.max(this.cells[index], levelAt(x, z));
      }
    }
  }
}
