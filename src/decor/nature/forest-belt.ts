import * as THREE from "three";
import { fractalNoise2D } from "../../core/noise";
import { celMaterial } from "../../rendering/cel-shading";
import { createInstancedOutline } from "../../rendering/instanced-outline";
import { applyWind, type WindOptions } from "../../rendering/wind";
import { pathDistance } from "../../tracks/relief";
import type { TrackLike } from "../../tracks/track";
import { VISUAL_QUALITY, type VisualQuality } from "../../core/visual-quality";
import { randomGenerator } from "../common";
import { farConiferGeometry, farTreeGeometry } from "./ground-cover-shapes";
import { scatterPoints } from "./scatter";

export interface ForestBeltOptions {
  readonly seed: number;
  /** How many meters the woods extend into the map bounds. */
  readonly inner: number;
  /** How far the woods extend beyond the bounds, in meters. */
  readonly outer: number;
  /** Average spacing between trees, in meters. */
  readonly spacing: number;
  /** Crown colors (per instance); conifers use the last one. */
  readonly colors: readonly number[];
  /** Fraction of conifers, from 0 to 1. */
  readonly coniferShare: number;
  /** Minimum distance from the centerline, so the woods do not close off the track. */
  readonly roadClearance: number;
  /** Multiplies the tree size; larger when the woods are far from the track. */
  readonly scale?: number;
  /** Areas without trees (landscape landmarks, water). */
  readonly exclude?: (x: number, z: number) => boolean;
}

const FAR_WIND: WindOptions = { strength: 0.12, from: 2, to: 5.5, speed: 1 };

/**
 * Continuous woods along the map edge and the skirt of the terrain: closes
 * off the horizon that used to end in a wall. Faceted geometry with no
 * shadows, since it is always tens of meters from the camera.
 */
export function createForestBelt(
  track: TrackLike,
  options: ForestBeltOptions,
  quality: VisualQuality = VISUAL_QUALITY,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "forest-belt";
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const random = randomGenerator(options.seed);
  // Signed distance to the map edge: negative inside, positive outside.
  const edge = (x: number, z: number) => {
    const outside = Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minZ - z, 0, z - maxZ));
    return outside > 0 ? outside : -Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
  };
  const area = {
    minX: minX - options.outer, maxX: maxX + options.outer,
    minZ: minZ - options.outer, maxZ: maxZ + options.outer,
  };
  const points = scatterPoints(area, options.spacing, options.seed, (x, z) => {
    const distance = edge(x, z);
    if (distance < -options.inner || distance > options.outer) return 0;
    if (options.exclude?.(x, z)) return 0;
    if (pathDistance(track.path, x, z) < options.roadClearance) return 0;
    // Dense rim, thinning outward, with noise clearings.
    const thinning = 1 - 0.55 * Math.max(0, distance) / options.outer;
    const clearing = fractalNoise2D(x / 30, z / 30, options.seed + 3);
    return thinning * (clearing < 0.32 ? 0.15 : 0.95) * quality.sceneryDensity;
  });

  const broadleaf: THREE.Matrix4[] = [];
  const conifers: THREE.Matrix4[] = [];
  const broadColors: THREE.Color[] = [];
  const coniferColors: THREE.Color[] = [];
  const dummy = new THREE.Object3D();
  const crownColors = options.colors.map((hex) => new THREE.Color(hex));
  for (const point of points) {
    const conifer = random() < options.coniferShare;
    // Taller toward the outside: the woods rise in steps toward the mountains.
    const scale = (1.05 + random() * 0.6) * (1 + Math.max(0, edge(point.x, point.z)) / 90) *
      (options.scale ?? 1);
    dummy.position.set(point.x, (track.groundHeightAt?.(point.x, point.z) ?? 0) - 0.1, point.z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.scale.set(scale, scale * (0.9 + random() * 0.25), scale);
    dummy.updateMatrix();
    const color = conifer
      ? crownColors[crownColors.length - 1].clone()
      : crownColors[Math.floor(random() * Math.max(1, crownColors.length - 1))].clone();
    color.offsetHSL((random() - 0.5) * 0.02, 0, (random() - 0.5) * 0.05);
    (conifer ? conifers : broadleaf).push(dummy.matrix.clone());
    (conifer ? coniferColors : broadColors).push(color);
  }

  const material = celMaterial(0xffffff);
  material.vertexColors = true;
  applyWind(material, FAR_WIND);
  const batches: [THREE.BufferGeometry, THREE.Matrix4[], THREE.Color[], string][] = [
    [farTreeGeometry(), broadleaf, broadColors, "forest-broadleaf"],
    [farConiferGeometry(), conifers, coniferColors, "forest-conifers"],
  ];
  for (const [geometry, matrices, colors, name] of batches) {
    if (matrices.length === 0) continue;
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    mesh.name = name;
    matrices.forEach((matrix, index) => {
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, colors[index]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    mesh.computeBoundingSphere();
    const outline = createInstancedOutline(mesh, 0.75);
    applyWind(outline.material as THREE.Material, FAR_WIND);
    group.add(mesh, outline);
  }
  return group;
}
