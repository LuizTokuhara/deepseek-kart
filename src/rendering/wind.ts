import * as THREE from "three/webgpu";
import {
  Fn,
  cameraViewMatrix,
  dot,
  float,
  modelViewMatrix,
  modelWorldMatrix,
  positionGeometry,
  positionLocal,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

/** Clock shared by all vegetation; stopped with reduced motion. */
export const windTime: THREE.UniformNode<"float"> = uniform(0);

/** How a material sways, in local geometry units. */
export interface WindOptions {
  /** Maximum displacement, in meters, at the top of the plant. */
  readonly strength: number;
  /** Local height below which nothing moves (base, trunk). */
  readonly from: number;
  /** Local height at which the sway reaches `strength`. */
  readonly to: number;
  /** Speed of the main oscillation, in rad/s. */
  readonly speed?: number;
  /** Instances shrink into the ground between these camera distances. */
  readonly fade?: { readonly near: number; readonly far: number };
}

/** Advances the wind; with `frozen`, the vegetation stands still. */
export function advanceWind(dt: number, frozen: boolean): void {
  if (!frozen) windTime.value += dt;
}

type NodePositionedMaterial = THREE.Material & {
  positionNode: THREE.Node | null;
  castShadowPositionNode?: THREE.Node | null;
};

function hasPositionNode(material: THREE.Material): material is NodePositionedMaterial {
  return "positionNode" in material;
}

/**
 * Makes the material sway in the vertex shader. In node materials, the displacement
 * goes in as `positionNode`; the WebGPURenderer shadow pass reuses that
 * same node, so the shadow follows the wind without `customDepthMaterial`.
 */
export function applyWind(material: THREE.Material, options: WindOptions): void {
  if (!hasPositionNode(material)) return;

  const previous: any = material.positionNode;
  const previousShadow: any = material.castShadowPositionNode;
  const speed = options.speed ?? 1.6;
  const fade = options.fade;

  const windNode = Fn(() => {
    const base: any = previous ?? positionLocal;
    const world: any = modelWorldMatrix.mul(vec4(base, 1)).xyz;
    const phase = dot(world.xz, vec2(0.13, 0.09));
    const gust = float(0.6).add(
      sin(
        windTime.mul(0.31)
          .add(world.x.mul(0.025))
          .add(world.z.mul(0.017)),
      ).mul(0.4),
    );
    const sway = sin(windTime.mul(speed).add(phase)).mul(0.75)
      .add(sin(windTime.mul(speed * 2.3).add(phase.mul(1.7))).mul(0.25));
    const bend = smoothstep(options.from, options.to, positionGeometry.y);
    let offset = vec3(0.8, 0, 0.6).mul(sway.mul(gust).mul(bend).mul(options.strength));

    if (fade) {
      const originView = cameraViewMatrix.mul(vec4(world, 1)).xyz;
      const factor = float(1).sub(
        smoothstep(fade.near, fade.far, originView.length()),
      );
      offset = offset.mul(factor);
    }

    return base.add(offset);
  })();

  material.positionNode = windNode;
  // Preserve an explicit shadow displacement if a caller provided one.
  if (previousShadow === null || previousShadow === undefined) {
    material.castShadowPositionNode = windNode;
  }
}

/**
 * Kept for the old decoration API. WebGPU reuses `positionNode` for shadows,
 * so the returned depth material is only a harmless WebGL-era fallback.
 */
export function windDepthMaterial(options: WindOptions): THREE.MeshDepthMaterial {
  return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
}
