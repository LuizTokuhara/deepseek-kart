import * as THREE from "three/webgpu";
import { materialColor, mix, positionGeometry, smoothstep, vec3 } from "three/tsl";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { celMaterial } from "../../rendering/cel-shading";

/** Length the barrier block is modeled at; instances stretch it along Z only. */
export const BARRIER_BLOCK_LENGTH = 1.8;
const BEVEL_RADIUS = 0.14;
const BEVEL_SEGMENTS = 3;
/** Paint brightness at the foot and at the top of the block. */
const FOOT_SHADE = 0.66;
const TOP_SHADE = 1.06;

/**
 * Molded plastic block at its real width and height, so the rounded edges keep
 * their shape instead of being squashed by a non-uniform instance scale.
 */
export function safetyBarrierGeometry(thickness: number, height: number): THREE.BufferGeometry {
  return new RoundedBoxGeometry(
    thickness,
    height,
    BARRIER_BLOCK_LENGTH,
    BEVEL_SEGMENTS,
    Math.min(BEVEL_RADIUS, thickness * 0.3, height * 0.3),
  );
}

/**
 * Cel paint that darkens toward the ground, like grime and bounce shadow at
 * the foot of the block, so a row of barriers reads as solid and heavy.
 */
export function safetyBarrierMaterial(color: number, height: number): THREE.MeshToonNodeMaterial {
  const material = celMaterial(color);
  const rise = smoothstep(-0.5, 0.45, positionGeometry.y.div(height));
  material.colorNode = materialColor.mul(vec3(mix(FOOT_SHADE, TOP_SHADE, rise)));
  return material;
}
