import * as THREE from "three";
import type { ColliderBox } from "../../core/types";
import { inkOutline, outlinedMaterial } from "../../rendering/cel-shading";
import { terrainMaterial, type TerrainFinish } from "../../rendering/terrain-material";

export interface HillSpot {
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

/** Longest collision segment around a hill; larger mounds get more of them. */
const RING_CHORD = 10;
const RING_MIN_SEGMENTS = 12;
const RING_MAX_SEGMENTS = 24;
/** Sits on the faceted silhouette, so the kart nose stops at the visible foot. */
const RING_FOOTPRINT = 0.99;
const RING_THICKNESS = 0.8;

/**
 * Faceted hills. With `finish`, they use the same texture as the ground, so
 * they look like part of the terrain instead of a smooth volume resting on it.
 */
export function buildHills(
  spots: readonly HillSpot[],
  parent: THREE.Group,
  color = 0x6f9052,
  finish?: TerrainFinish,
): void {
  const material = finish ? terrainMaterial(color, finish) : outlinedMaterial(color);
  if (finish) inkOutline(material, 0.0012, 0x000000);

  for (const hill of spots) {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      material,
    );
    mesh.position.set(hill.x, 0, hill.z);
    mesh.scale.set(hill.sx, hill.sy, hill.sz);
    mesh.receiveShadow = finish !== undefined;
    parent.add(mesh);
  }
}

/**
 * Solid ring at the foot of each hill. The mounds are scenery, not drivable
 * terrain, so this keeps karts, items and the chase camera out of the mesh.
 * Segments overlap at the corners: there is no gap to slip through.
 */
export function hillColliders(hills: readonly HillSpot[]): ColliderBox[] {
  const colliders: ColliderBox[] = [];

  for (const hill of hills) {
    const radiusX = hill.sx * RING_FOOTPRINT;
    const radiusZ = hill.sz * RING_FOOTPRINT;
    const segments = Math.min(
      RING_MAX_SEGMENTS,
      Math.max(
        RING_MIN_SEGMENTS,
        Math.ceil((Math.PI * (radiusX + radiusZ)) / RING_CHORD),
      ),
    );

    for (let index = 0; index < segments; index++) {
      const from = (index / segments) * Math.PI * 2;
      const to = ((index + 1) / segments) * Math.PI * 2;
      const x0 = hill.x + Math.cos(from) * radiusX;
      const z0 = hill.z + Math.sin(from) * radiusZ;
      const x1 = hill.x + Math.cos(to) * radiusX;
      const z1 = hill.z + Math.sin(to) * radiusZ;
      const dx = x1 - x0;
      const dz = z1 - z0;
      const length = Math.hypot(dx, dz);

      colliders.push({
        center: {
          x: (x0 + x1) / 2,
          y: hill.sy / 2,
          z: (z0 + z1) / 2,
        },
        // Local z runs along the segment; the thickness closes the corners.
        half: {
          x: RING_THICKNESS,
          y: hill.sy / 2,
          z: length / 2 + RING_THICKNESS,
        },
        yaw: Math.atan2(dx, dz),
      });
    }
  }

  return colliders;
}

/**
 * Approximate slope height at (x, z); 0 outside the hill. The flat faces sit a
 * little inside the ellipse, so the value is reduced to keep nothing floating.
 */
export function hillHeightAt(hill: HillSpot, x: number, z: number): number {
  const u = (x - hill.x) / hill.sx;
  const v = (z - hill.z) / hill.sz;
  const radial = u * u + v * v;
  return radial >= 1 ? 0 : hill.sy * Math.sqrt(1 - radial) * 0.92;
}
