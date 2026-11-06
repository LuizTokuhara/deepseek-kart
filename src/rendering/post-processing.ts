import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { Pass } from "three/addons/postprocessing/Pass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { OutlineEffect } from "three/addons/effects/OutlineEffect.js";
import type { ColorGrade } from "./environment";
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
 * Then applies the course's color grade in display space, where contrast and
 * saturation behave as an artist expects.
 */
const DisplayResolveShader = {
  name: "DisplayResolveShader",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    gradeContrast: { value: 1 },
    gradeSaturation: { value: 1 },
    gradeShadowTint: { value: new THREE.Color(1, 1, 1) },
    gradeHighlightTint: { value: new THREE.Color(1, 1, 1) },
    gradeVignette: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float gradeContrast;
    uniform float gradeSaturation;
    uniform vec3 gradeShadowTint;
    uniform vec3 gradeHighlightTint;
    uniform float gradeVignette;
    varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(tDiffuse, vUv);
      float peak = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);
      gl_FragColor.rgb /= max(peak, 1.0);
      gl_FragColor.a = 1.0;
      #include <colorspace_fragment>
      vec3 graded = gl_FragColor.rgb;
      float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
      graded = mix(vec3(luma), graded, gradeSaturation);
      graded = (graded - 0.5) * gradeContrast + 0.5;
      // Tints shift hue only: dividing by their luma keeps the brightness.
      vec3 tint = mix(gradeShadowTint, gradeHighlightTint, smoothstep(0.05, 0.85, luma));
      graded *= tint / max(dot(tint, vec3(0.2126, 0.7152, 0.0722)), 0.001);
      vec2 corner = (vUv - 0.5) * vec2(1.0, 0.75);
      graded *= 1.0 - gradeVignette * smoothstep(0.25, 0.62, length(corner));
      gl_FragColor.rgb = clamp(graded, 0.0, 1.0);
    }`,
};

/**
 * Scene → selective bloom → display resolve and color grade, with MSAA on
 * the scene buffer.
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
    grade: ColorGrade = {},
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
    const uniforms = resolve.uniforms as typeof DisplayResolveShader.uniforms;
    uniforms.gradeContrast.value = grade.contrast ?? 1;
    uniforms.gradeSaturation.value = grade.saturation ?? 1;
    // Display-space tints: the hex is used as-is, without sRGB → linear conversion.
    uniforms.gradeShadowTint.value.setHex(grade.shadowTint ?? 0xffffff, THREE.NoColorSpace);
    uniforms.gradeHighlightTint.value.setHex(grade.highlightTint ?? 0xffffff, THREE.NoColorSpace);
    uniforms.gradeVignette.value = grade.vignette ?? 0;
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
