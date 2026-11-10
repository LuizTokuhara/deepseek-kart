import * as THREE from "three/webgpu";
import {
  clamp,
  dot,
  float,
  length,
  max,
  mix,
  screenUV,
  sRGBTransferOETF,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import DepthOfFieldNode, { dof } from "three/addons/tsl/display/DepthOfFieldNode.js";
import { AmbientOcclusion } from "./ambient-occlusion";
import { PaintedBloomNode } from "./painted-bloom";
import { SceneColorPass } from "./scene-color-pass";
import type { ColorGrade } from "./environment";
import type { LensFocus } from "./cinematic-camera";
import { BLOOM_KNEE, BLOOM_THRESHOLD } from "./glow";

const BLOOM_STRENGTH = 0.42;
// Low radius keeps halos hugging their source; wide mips tinted the whole grid.
const BLOOM_RADIUS = 0.05;
const MSAA_SAMPLES = 4;
// Radial taps toward the screen center; the center stays sharp while the
// edges smear, which reads as forward acceleration without a velocity buffer.
const BOOST_BLUR_SAMPLES = 6;
const BOOST_BLUR_STRENGTH = 0.075;

/** Call after renderer.init(): WebGPU guarantees renderable rgba16float. */
export function supportsHdr(renderer: Pick<THREE.WebGPURenderer, "backend">): boolean {
  const backend = renderer.backend as unknown as {
    isWebGPUBackend?: boolean;
    extensions?: { has(name: string): boolean };
  };
  return backend.isWebGPUBackend === true
    || backend.extensions?.has("EXT_color_buffer_float") === true
    || backend.extensions?.has("EXT_color_buffer_half_float") === true;
}

/**
 * Scene → selective bloom → display resolve and color grade, all as TSL nodes.
 * `RenderPipeline` replaces EffectComposer, which only works with WebGLRenderer.
 * The final node resolves HDR in display space, so the pipeline's automatic
 * output transform stays disabled.
 */
export class PostProcessing {
  private readonly pipeline: THREE.RenderPipeline;
  private readonly scenePass: SceneColorPass;
  private readonly bloomPass: PaintedBloomNode | null;
  private readonly occlusion: AmbientOcclusion;
  private readonly depthOfField: DepthOfFieldNode;
  private readonly boostBlur = uniform(0);
  private readonly focusDistance = uniform(10);
  private readonly focusRange = uniform(8);
  private readonly bokehScale = uniform(1);
  private readonly raceOutput: THREE.Node<"vec4">;
  private readonly cinematicOutput: THREE.Node<"vec4">;
  readonly hdr: boolean;

  constructor(
    renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    grade: ColorGrade = {},
  ) {
    this.hdr = supportsHdr(renderer);
    const scenePass = new SceneColorPass(
      scene, camera, this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, MSAA_SAMPLES,
    );
    this.scenePass = scenePass;
    this.bloomPass = null;
    const sceneColor = scenePass.getTextureNode("output");
    let bloomColor: THREE.Node<"vec3"> = vec3(0);
    if (this.hdr) {
      const bloomPass = new PaintedBloomNode(sceneColor, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
      this.bloomPass = bloomPass;
      bloomPass.smoothWidth.value = BLOOM_KNEE;
      // r187 uses the same five kernels/weights as UnrealBloomPass. Match its
      // half drawing-buffer resolution explicitly, including high-DPI screens.
      bloomPass.setResolutionScale(0.5);
      bloomColor = vec3(bloomPass);
    }

    // Contact shading darkens lit paint only; glowing HDR pixels keep full light.
    this.occlusion = new AmbientOcclusion(scenePass.getTextureNode("depth"), camera);
    const lit = this.radialBlur(sceneColor);
    const litPeak = max(max(lit.r, lit.g), lit.b);
    const shaded = lit.mul(mix(this.occlusion.factor, float(1), smoothstep(1.0, 1.6, litPeak)));

    // The cinematic films through a shallow lens; bloom is added after the
    // blur so glowing paint keeps a crisp halo.
    this.depthOfField = dof(
      shaded, scenePass.getViewZNode(), this.focusDistance, this.focusRange, this.bokehScale,
    );
    const focused = this.depthOfField as unknown as THREE.Node<"vec4">;

    const display = displayGrade(grade);
    this.raceOutput = display(shaded.add(bloomColor));
    this.cinematicOutput = display(focused.rgb.add(bloomColor));
    this.pipeline = new THREE.RenderPipeline(renderer);
    this.pipeline.outputColorTransform = false;
    this.pipeline.outputNode = this.raceOutput;
  }

  /**
   * Switches the shallow-focus lens on (cinematic) or off (race). Off, the DOF
   * passes leave the graph, so racing pays nothing for them.
   */
  setLens(lens: LensFocus | null): void {
    if (lens) {
      this.focusDistance.value = lens.distance;
      this.focusRange.value = lens.range;
      this.bokehScale.value = lens.bokeh;
    }
    const output = lens ? this.cinematicOutput : this.raceOutput;
    if (this.pipeline.outputNode !== output) {
      this.pipeline.outputNode = output;
      this.pipeline.needsUpdate = true;
    }
  }

  /** 0 = sharp, 1 = full radial smear. Driven by the player's boost timer. */
  setBoost(intensity: number): void {
    this.boostBlur.value = Math.min(1, Math.max(0, intensity));
  }

  private radialBlur(
    color: ReturnType<SceneColorPass["getTextureNode"]>,
  ): THREE.Node<"vec3"> {
    const center = screenUV.sub(0.5);
    let sum = color.sample(screenUV).rgb;
    for (let i = 1; i <= BOOST_BLUR_SAMPLES; i++) {
      const step = center.mul((i / BOOST_BLUR_SAMPLES) * BOOST_BLUR_STRENGTH);
      sum = sum.add(color.sample(screenUV.sub(step.mul(this.boostBlur))).rgb);
    }
    const blurred = sum.div(BOOST_BLUR_SAMPLES + 1);
    return mix(color.rgb, blurred, this.boostBlur);
  }

  render(): void {
    this.pipeline.render();
  }

  dispose(): void {
    this.pipeline.dispose();
    this.bloomPass?.dispose();
    this.occlusion.dispose();
    this.depthOfField.dispose();
    this.scenePass.dispose();
  }

  /** Passes follow the renderer's drawing buffer; kept for the resize hook. */
  setSize(_width: number, _height: number, _pixelRatio: number): void {}
}

/**
 * HDR → display: brings HDR back to range without per-channel clipping, then
 * grades in display space. Dividing by the peak channel keeps glowing paint on
 * its own hue instead of washing to yellow/white.
 */
function displayGrade(grade: ColorGrade): (hdr: THREE.Node<"vec3">) => THREE.Node<"vec4"> {
  const contrast = uniform(grade.contrast ?? 1);
  const saturation = uniform(grade.saturation ?? 1);
  const shadowTint = uniform(new THREE.Color().setHex(grade.shadowTint ?? 0xffffff, THREE.NoColorSpace));
  const highlightTint = uniform(
    new THREE.Color().setHex(grade.highlightTint ?? 0xffffff, THREE.NoColorSpace),
  );
  const vignette = uniform(grade.vignette ?? 0);

  return (hdr) => {
    const peak = max(max(hdr.r, hdr.g), hdr.b);
    const resolved = hdr.div(max(peak, float(1.0)));
    const display = (sRGBTransferOETF(vec4(resolved, 1.0)) as unknown as { rgb: any }).rgb;

    // Contrast and saturation behave as an artist expects in display space.
    // Tints shift hue only: dividing by their luma keeps brightness.
    const luma = dot(display, vec3(0.2126, 0.7152, 0.0722));
    let graded = mix(vec3(luma), display, saturation);
    graded = graded.sub(0.5).mul(contrast).add(0.5);
    const tint = mix(shadowTint, highlightTint, smoothstep(0.05, 0.85, luma));
    const tintLuma = max(dot(tint, vec3(0.2126, 0.7152, 0.0722)), float(0.001));
    graded = graded.mul(tint.div(tintLuma));

    // Vignette uses screen-space UVs, matching the old full-screen pass.
    const centered = screenUV.sub(0.5).mul(vec2(1.0, 0.75));
    graded = graded.mul(float(1.0).sub(vignette.mul(smoothstep(0.25, 0.62, length(centered)))));
    return vec4(clamp(graded, 0.0, 1.0), 1.0);
  };
}
