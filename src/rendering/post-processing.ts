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
import { PaintedBloomNode } from "./painted-bloom";
import { SceneColorPass } from "./scene-color-pass";
import type { ColorGrade } from "./environment";
import { BLOOM_KNEE, BLOOM_THRESHOLD } from "./glow";

const BLOOM_STRENGTH = 0.42;
// Low radius keeps halos hugging their source; wide mips tinted the whole grid.
const BLOOM_RADIUS = 0.05;
const MSAA_SAMPLES = 4;

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

    // Bring HDR back to display range without per-channel clipping: dividing by
    // the peak channel keeps glowing paint on its own hue instead of washing to
    // yellow/white. Pixels already in range pass through.
    const hdr = sceneColor.rgb.add(bloomColor);
    const peak = max(max(hdr.r, hdr.g), hdr.b);
    const resolved = hdr.div(max(peak, float(1.0)));
    const display = (sRGBTransferOETF(vec4(resolved, 1.0)) as unknown as { rgb: any }).rgb;

    const contrast = uniform(grade.contrast ?? 1);
    const saturation = uniform(grade.saturation ?? 1);
    const shadowTint = uniform(
      new THREE.Color().setHex(grade.shadowTint ?? 0xffffff, THREE.NoColorSpace),
    );
    const highlightTint = uniform(
      new THREE.Color().setHex(grade.highlightTint ?? 0xffffff, THREE.NoColorSpace),
    );
    const vignette = uniform(grade.vignette ?? 0);

    // Grade in display space, where contrast and saturation behave as an artist
    // expects. Tints shift hue only: dividing by their luma keeps brightness.
    const luma = dot(display, vec3(0.2126, 0.7152, 0.0722));
    let graded = mix(vec3(luma), display, saturation);
    graded = graded.sub(0.5).mul(contrast).add(0.5);
    const tint = mix(
      shadowTint,
      highlightTint,
      smoothstep(0.05, 0.85, luma),
    );
    const tintLuma = max(
      dot(tint, vec3(0.2126, 0.7152, 0.0722)),
      float(0.001),
    );
    graded = graded.mul(tint.div(tintLuma));

    // Vignette uses screen-space UVs, matching the old full-screen pass.
    const centered = screenUV.sub(0.5).mul(vec2(1.0, 0.75));
    graded = graded.mul(
      float(1.0).sub(vignette.mul(smoothstep(0.25, 0.62, length(centered)))),
    );

    this.pipeline = new THREE.RenderPipeline(renderer);
    this.pipeline.outputColorTransform = false;
    this.pipeline.outputNode = vec4(clamp(graded, 0.0, 1.0), 1.0);
  }

  render(): void {
    this.pipeline.render();
  }

  dispose(): void {
    this.pipeline.dispose();
    this.bloomPass?.dispose();
    this.scenePass.dispose();
  }

  /** Passes follow the renderer's drawing buffer; kept for the resize hook. */
  setSize(_width: number, _height: number, _pixelRatio: number): void {}
}
