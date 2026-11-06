import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { Pass } from "three/addons/postprocessing/Pass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { OutlineEffect } from "three/addons/effects/OutlineEffect.js";
import { BLOOM_KNEE, BLOOM_THRESHOLD } from "./glow";
import { blendFogInSrgb } from "./srgb-fog";

const BLOOM_STRENGTH = 0.42;
// Low radius keeps halos hugging their source; wide mips tinted the whole grid.
const BLOOM_RADIUS = 0.05;
const MSAA_SAMPLES = 4;

/** Draws the cel-shaded scene plus ink outlines into the composer's buffer. */
class OutlinedScenePass extends Pass {
  constructor(
    private readonly outline: OutlineEffect,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    super();
    this.needsSwap = false;
  }

  render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    renderer.setRenderTarget(readBuffer);
    this.outline.render(this.scene, this.camera);
  }
}

/**
 * Brings HDR back to display range without per-channel clipping: dividing by
 * the peak channel keeps glowing paint on its own hue instead of washing to
 * yellow/white. Pixels already in range (all regular paint) pass through.
 */
const DisplayResolveShader = {
  name: "DisplayResolveShader",
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(tDiffuse, vUv);
      float peak = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);
      gl_FragColor.rgb /= max(peak, 1.0);
      gl_FragColor.a = 1.0;
      #include <colorspace_fragment>
    }`,
};

/**
 * Scene → selective bloom → display resolve, with MSAA on the scene buffer.
 * Only colors lifted by `glowColor()` exceed the bloom threshold. Without
 * float render targets, falls back to an 8-bit buffer with bloom disabled.
 */
export class PostProcessing {
  readonly hdr: boolean;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    outline: OutlineEffect,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    blendFogInSrgb();
    this.hdr = renderer.extensions.has("EXT_color_buffer_float");
    // The composer treats a supplied target's size as CSS pixels; the real
    // size (CSS × pixel ratio) is applied by setSize() once passes exist.
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: MSAA_SAMPLES,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new OutlinedScenePass(outline, scene, camera));

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.bloom = new UnrealBloomPass(size, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
    (this.bloom.highPassUniforms as Record<string, THREE.IUniform<number>>).smoothWidth.value =
      BLOOM_KNEE;
    this.bloom.enabled = this.hdr;
    this.composer.addPass(this.bloom);

    const resolve = new ShaderPass(DisplayResolveShader);
    // No pass swaps, so the scene always lands in the same buffer and the
    // composer's second (multisampled) target is never allocated.
    resolve.needsSwap = false;
    this.composer.addPass(resolve);

    const cssSize = renderer.getSize(new THREE.Vector2());
    this.setSize(cssSize.x, cssSize.y, renderer.getPixelRatio());
  }

  render(): void {
    this.composer.render();
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }
}
