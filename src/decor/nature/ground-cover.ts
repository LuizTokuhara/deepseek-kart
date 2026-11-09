import * as THREE from "three";
import type { ColliderBox } from "../../core/types";
import { fractalNoise2D } from "../../core/noise";
import { celMaterial } from "../../rendering/cel-shading";
import { createInstancedOutline } from "../../rendering/instanced-outline";
import { applyWind, windDepthMaterial, type WindOptions } from "../../rendering/wind";
import type { TrackLike } from "../../tracks/track";
import { randomGenerator } from "../common";
import {
  bushGeometry, flowerGeometry, grassTuftGeometry, pebbleGeometry,
} from "./ground-cover-shapes";
import { ExclusionMask, RoadDistanceField, scatterPoints } from "./scatter";

/** Ground vegetation for a track; every layer is optional except the grass. */
export interface GroundCoverOptions {
  readonly seed: number;
  /**
   * Base color (same as the ground) and blade tip color; `spacing` in meters
   * and `density` (0 to 1, default 1) for sparse ground, such as snow or sand.
   */
  readonly grass: {
    readonly base: number;
    readonly tip: number;
    readonly spacing: number;
    readonly density?: number;
  };
  readonly flowers?: { readonly colors: readonly number[]; readonly spacing: number };
  readonly pebbles?: { readonly color: number; readonly spacing: number };
  readonly bushes?: { readonly color: number; readonly spacing: number };
  /** Scenery colliders: nothing spawns inside them, and solids keep clearance. */
  readonly avoid?: readonly ColliderBox[];
  /** Scenery whose ground-level pieces (floor, sand, water) stay free of vegetation. */
  readonly flatRoot?: THREE.Object3D;
  /** Points with no vegetation at all (water, buildings). */
  readonly exclude?: (x: number, z: number) => boolean;
}

interface Instance {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: { readonly x: number; readonly y: number; readonly z: number };
  readonly color?: THREE.Color;
}

/** Side of the grass chunks; each chunk is a draw call with its own culling. */
const CHUNK_SIZE = 32;
const GRASS_WIND: WindOptions = {
  strength: 0.07, from: 0.02, to: 0.5, speed: 2.2, fade: { near: 34, far: 50 },
};
const FLOWER_WIND: WindOptions = {
  strength: 0.05, from: 0.02, to: 0.32, speed: 2.2, fade: { near: 30, far: 46 },
};
const BUSH_WIND: WindOptions = { strength: 0.045, from: 0.3, to: 1.6, speed: 1.3 };
/** Distance at which a chunk disappears for good: after the fade + half a diagonal. */
const CHUNK_CULL = GRASS_WIND.fade!.far + CHUNK_SIZE * 0.72;

const smoothStep = (from: number, to: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

function instancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  instances: readonly Instance[],
  origin = new THREE.Vector3(),
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
  const dummy = new THREE.Object3D();
  instances.forEach((instance, index) => {
    dummy.position.set(instance.x - origin.x, instance.y - origin.y, instance.z - origin.z);
    dummy.rotation.set(0, instance.yaw, 0);
    dummy.scale.set(instance.scale.x, instance.scale.y, instance.scale.z);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    if (instance.color) mesh.setColorAt(index, instance.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Chunks with LOD: near the camera they draw; far away, they do not even enter the queue. */
function chunked(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  instances: readonly Instance[],
  name: string,
): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const chunks = new Map<string, Instance[]>();
  for (const instance of instances) {
    const key = `${Math.floor(instance.x / CHUNK_SIZE)},${Math.floor(instance.z / CHUNK_SIZE)}`;
    const chunk = chunks.get(key) ?? [];
    chunk.push(instance);
    chunks.set(key, chunk);
  }
  for (const chunk of chunks.values()) {
    const center = new THREE.Vector3(
      chunk.reduce((sum, item) => sum + item.x, 0) / chunk.length,
      chunk.reduce((sum, item) => sum + item.y, 0) / chunk.length,
      chunk.reduce((sum, item) => sum + item.z, 0) / chunk.length,
    );
    const mesh = instancedMesh(geometry, material, chunk, center);
    mesh.receiveShadow = true;
    const lod = new THREE.LOD();
    lod.position.copy(center);
    lod.addLevel(mesh, 0);
    lod.addLevel(new THREE.Object3D(), CHUNK_CULL);
    group.add(lod);
  }
  return group;
}

function swayingMaterial(wind: WindOptions): ReturnType<typeof celMaterial> {
  const material = celMaterial(0xffffff);
  material.vertexColors = true;
  material.side = THREE.DoubleSide;
  applyWind(material, wind);
  return material;
}

/**
 * Grass, flowers, pebbles and bushes scattered outside the barriers. Everything
 * is decorative and has no collision: bushes and pebbles stay away from the
 * drivable area.
 */
export function createGroundCover(track: TrackLike, options: GroundCoverOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = "ground-cover";
  const field = new RoadDistanceField(track);
  const random = randomGenerator(options.seed);
  const groundY = (x: number, z: number) => track.groundHeightAt?.(x, z) ?? 0;
  // Just past the barrier; nothing spawns inside it.
  const fringe = track.wallOffset + 0.45;
  const area = {
    minX: track.bounds.minX + 1, maxX: track.bounds.maxX - 1,
    minZ: track.bounds.minZ + 1, maxZ: track.bounds.maxZ - 1,
  };
  const mask = new ExclusionMask(track.bounds);
  mask.addColliders(options.avoid ?? [], 0.9);
  if (options.flatRoot) mask.addFlatFootprints(options.flatRoot);
  // Solids (pebbles, bushes) also respect the clearance around the colliders.
  const open = (x: number, z: number, clearance: number, solid = false) =>
    field.at(x, z) >= clearance && mask.level(x, z) < (solid ? 1 : 2) &&
    !options.exclude?.(x, z);
  const tint = (lightness: number, hue = 0) =>
    new THREE.Color(1, 1, 1).offsetHSL(hue, 0, 0).multiplyScalar(lightness);

  // Patches of tall, sparse grass; a dense band at the foot of the barriers.
  const patch = (x: number, z: number) => fractalNoise2D(x / 16, z / 16, options.seed);
  const grass = scatterPoints(area, options.grass.spacing, options.seed + 1, (x, z) => {
    if (!open(x, z, fringe)) return 0;
    const edge = field.at(x, z) - fringe < 2.2 ? 0.95 : 0;
    const density = Math.max(edge, 0.22 + 0.78 * smoothStep(0.3, 0.68, patch(x, z)));
    return density * (options.grass.density ?? 1);
  }).map((point): Instance => {
    const size = 0.8 + random() * 0.45;
    const tall = 0.75 + patch(point.x, point.z) * 0.7 + random() * 0.25;
    return {
      ...point, y: groundY(point.x, point.z) - 0.02, yaw: random() * Math.PI * 2,
      scale: { x: size, y: size * tall, z: size }, color: tint(0.92 + random() * 0.14),
    };
  });
  const grassGeometry = grassTuftGeometry(options.grass.base, options.grass.tip);
  group.add(chunked(grassGeometry, swayingMaterial(GRASS_WIND), grass, "grass"));

  if (options.flowers) {
    const colors = options.flowers.colors.map((hex) => new THREE.Color(hex));
    const bed = (x: number, z: number) => fractalNoise2D(x / 9, z / 9, options.seed + 5);
    const flowers = scatterPoints(area, options.flowers.spacing, options.seed + 2, (x, z) =>
      open(x, z, fringe + 0.5) ? smoothStep(0.5, 0.66, bed(x, z)) : 0,
    ).map((point): Instance => {
      // One color per bed, like a real field.
      const pick = fractalNoise2D(point.x / 24, point.z / 24, options.seed + 9);
      const color = colors[Math.min(colors.length - 1, Math.floor(pick * colors.length))];
      const size = 0.9 + random() * 0.5;
      return {
        ...point, y: groundY(point.x, point.z) - 0.02, yaw: random() * Math.PI * 2,
        scale: { x: size, y: size, z: size },
        color: color.clone().multiplyScalar(0.9 + random() * 0.1),
      };
    });
    group.add(chunked(flowerGeometry(), swayingMaterial(FLOWER_WIND), flowers, "flowers"));
  }

  if (options.pebbles) {
    const pebbles = scatterPoints(area, options.pebbles.spacing, options.seed + 3, (x, z) => {
      if (!open(x, z, fringe + 0.3, true)) return 0;
      return field.at(x, z) - fringe < 3 ? 0.45 : 0.16;
    }).map((point): Instance => {
      const size = 0.14 + random() ** 2 * 0.36;
      return {
        ...point, y: groundY(point.x, point.z) - size * 0.22, yaw: random() * Math.PI * 2,
        scale: { x: size, y: size * (0.7 + random() * 0.5), z: size },
      };
    });
    if (pebbles.length > 0) {
      const mesh = instancedMesh(pebbleGeometry(), celMaterial(options.pebbles.color), pebbles);
      mesh.name = "pebbles";
      mesh.receiveShadow = true;
      group.add(mesh, createInstancedOutline(mesh, 0.7));
    }
  }

  if (options.bushes) {
    const bushes = scatterPoints(area, options.bushes.spacing, options.seed + 4, (x, z) => {
      if (!open(x, z, track.wallOffset + 3, true)) return 0;
      return 0.5 * smoothStep(0.55, 0.72, fractalNoise2D(x / 22, z / 22, options.seed + 13));
    }).map((point): Instance => {
      const size = 0.6 + random() * 0.55;
      const base = new THREE.Color(options.bushes!.color);
      return {
        ...point, y: groundY(point.x, point.z) - 0.12, yaw: random() * Math.PI * 2,
        scale: { x: size, y: size * (0.85 + random() * 0.35), z: size },
        color: base.offsetHSL((random() - 0.5) * 0.03, 0, (random() - 0.5) * 0.06),
      };
    });
    if (bushes.length === 0) return group;
    const material = celMaterial(0xffffff);
    material.vertexColors = true;
    applyWind(material, BUSH_WIND);
    const mesh = instancedMesh(bushGeometry(), material, bushes);
    mesh.name = "bushes";
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.customDepthMaterial = windDepthMaterial(BUSH_WIND);
    const outline = createInstancedOutline(mesh, 0.8);
    applyWind(outline.material as THREE.Material, BUSH_WIND);
    group.add(mesh, outline);
  }
  return group;
}
