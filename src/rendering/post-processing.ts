import * as THREE from "three/webgpu";
import {
  clamp,
  dot,
  float,
  length,
  max,
  mix,
  mrt,
  output,
  screenUV,
  sRGBTransferOETF,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { AmbientOcclusion } from "./ambient-occlusion";
import { INK_MASK, InkEdges } from "./ink-edges";
import { PaintedBloomNode } from "./painted-bloom";
import { SceneColorPass } from "./scene-color-pass";
import type { ColorGrade } from "./environment";
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
  readonly ink: InkEdges;
  private readonly boostBlur = uniform(0);
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
    // A second target flags which pixels may take ink; materials opt out with withoutInk().
    scenePass.setMRT(mrt({ output, [INK_MASK]: float(1) }));
    scenePass.getTexture(INK_MASK).type = THREE.UnsignedByteType;
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
    const contact = lit.mul(mix(this.occlusion.factor, float(1), smoothstep(1.0, 1.6, litPeak)));
    // Ink goes on before the lens and bloom, like lines drawn on the painted frame.
    this.ink = new InkEdges(
      scenePass.getTextureNode("depth"),
      scenePass.getTextureNode(INK_MASK),
      camera as THREE.PerspectiveCamera,
    );
    // Ink comes from the sharp depth buffer; let it go where the boost blur
    // smears the frame, so crisp lines do not float over ghosted scenery.
    const smear = this.boostBlur.mul(smoothstep(0.08, 0.4, length(screenUV.sub(0.5))));
    const shaded = this.ink.apply(contact, smear.oneMinus());

    // Race and cinematic share one sharp, inked frame: a comic panel has no lens blur.
    this.pipeline = new THREE.RenderPipeline(renderer);
    this.pipeline.outputColorTransform = false;
    this.pipeline.outputNode = displayGrade(grade)(shaded.add(bloomColor));
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
