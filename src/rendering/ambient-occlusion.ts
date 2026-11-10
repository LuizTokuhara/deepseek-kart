import * as THREE from "three/webgpu";
import {
  abs,
  cameraFar,
  cameraNear,
  float,
  max,
  mix,
  orthographicDepthToViewZ,
  perspectiveDepthToViewZ,
  screenUV,
  smoothstep,
  textureSize,
  uniform,
  vec2,
} from "three/tsl";
import { ao, type default as GTAONode } from "three/addons/tsl/display/GTAONode.js";

/** Contact shading tuning; distances are in meters. */
export const AMBIENT_OCCLUSION = {
  /** World-space reach of the occlusion around each pixel. */
  radius: 1.6,
  thickness: 1.2,
  /** Darkness of fully occluded creases, from 0 (none) to 1 (black). */
  strength: 0.85,
  /** Exponent on the raw occlusion; higher deepens creases more than open faces. */
  contrast: 1.8,
  /** The AO buffer runs at this fraction of the drawing buffer. */
  resolutionScale: 0.5,
  /** Occlusion fades out between these view distances, where fog takes over. */
  fadeStart: 45,
  fadeEnd: 110,
  /** Linear depth difference (relative) that stops the blur at silhouettes. */
  edgeTolerance: 0.06,
} as const;

// The GTAO noise is a 4x4 magic square in AO texels; a 4x4 box hides it.
const BLUR_TAPS = [-1.5, -0.5, 0.5, 1.5];

/**
 * Screen-space ambient occlusion (GTAO) for the main scene pass, using normals
 * rebuilt from depth so the scene needs no extra MRT target. `factor` is a
 * multiplier for the scene color: 1 in the open, darker in contact creases.
 */
export class AmbientOcclusion {
  readonly factor: THREE.Node<"float">;
  readonly strength = uniform(AMBIENT_OCCLUSION.strength as number);
  private readonly pass: GTAONode;

  constructor(depth: THREE.TextureNode, camera: THREE.Camera) {
    this.pass = ao(depth, null as unknown as THREE.Node, camera);
    this.pass.resolutionScale = AMBIENT_OCCLUSION.resolutionScale;
    this.pass.radius.value = AMBIENT_OCCLUSION.radius;
    this.pass.thickness.value = AMBIENT_OCCLUSION.thickness;
    this.pass.scale.value = AMBIENT_OCCLUSION.contrast;

    const occlusion = this.pass.getTextureNode();
    const toViewZ = (camera as THREE.OrthographicCamera).isOrthographicCamera
      ? orthographicDepthToViewZ
      : perspectiveDepthToViewZ;
    const viewDepth = (uv: THREE.Node<"vec2">) =>
      toViewZ(depth.sample(uv).r, cameraNear, cameraFar).negate();
    const centerDepth = viewDepth(screenUV).toConst();
    const texel = vec2(1).div(vec2(textureSize(occlusion) as unknown as THREE.Node<"vec2">)).toConst();

    // Depth-aware box blur: taps across a silhouette would leak dark halos.
    let sum: THREE.Node<"float"> = float(0);
    let weights: THREE.Node<"float"> = float(0);
    for (const y of BLUR_TAPS) {
      for (const x of BLUR_TAPS) {
        const uv = screenUV.add(texel.mul(vec2(x, y)));
        const difference = abs(viewDepth(uv).sub(centerDepth)).div(max(centerDepth, 0.1));
        const weight = float(1).sub(smoothstep(0, AMBIENT_OCCLUSION.edgeTolerance, difference));
        sum = sum.add(occlusion.sample(uv).r.mul(weight));
        weights = weights.add(weight);
      }
    }
    const blurred = sum.div(max(weights, 0.0001));

    const fade = smoothstep(AMBIENT_OCCLUSION.fadeStart, AMBIENT_OCCLUSION.fadeEnd, centerDepth);
    this.factor = mix(float(1), blurred, this.strength.mul(fade.oneMinus()));
  }

  dispose(): void {
    this.pass.dispose();
  }
}
