import * as THREE from "three/webgpu";
import { describe, expect, it } from "vitest";
import { supportsHdr } from "../src/rendering/post-processing";
import { PaintedBloomNode } from "../src/rendering/painted-bloom";
import { SceneColorPass } from "../src/rendering/scene-color-pass";
import { vec4 } from "three/tsl";

describe("post-processing capability selection", () => {
  it.each([THREE.HalfFloatType, THREE.UnsignedByteType])(
    "preserves scene buffer type %s when PassNode is compiled for an 8-bit display",
    (type) => {
      const pass = new SceneColorPass(new THREE.Scene(), new THREE.PerspectiveCamera(), type, 4);
      pass.setup({ renderer: {
        getOutputBufferType: () => THREE.UnsignedByteType,
        reversedDepthBuffer: false,
      } } as unknown as THREE.NodeBuilder);
      expect(pass.renderTarget.texture.type).toBe(type);
      expect(pass.renderTarget.samples).toBe(4);
      pass.dispose();
    },
  );
  it("matches UnrealBloomPass mip rounding even at odd and tiny viewport sizes", () => {
    const bloom = new PaintedBloomNode(vec4(0));
    const buffers = bloom as unknown as { _renderTargetsHorizontal: THREE.RenderTarget[] };
    bloom.setSize(1279, 719);
    expect(buffers._renderTargetsHorizontal.map((target) => [target.width, target.height])).toEqual([
      [640, 360], [320, 180], [160, 90], [80, 45], [40, 23],
    ]);
    bloom.setSize(1, 1);
    expect(buffers._renderTargetsHorizontal.every((target) => target.width === 1 && target.height === 1)).toBe(true);
    bloom.dispose();
  });
  it.each([
    [true, [], true],
    [false, ["EXT_color_buffer_float"], true],
    [false, ["EXT_color_buffer_half_float"], true],
    [false, ["OES_texture_float_linear"], false],
    [false, [], false],
  ] as const)("selects HDR only with renderable float buffers (%s, %s)", (gpu, extensions, expected) => {
    const renderer = { backend: {
      isWebGPUBackend: gpu,
      extensions: { has: (name: string) => (extensions as readonly string[]).includes(name) },
    } } as unknown as Pick<THREE.WebGPURenderer, "backend">;
    expect(supportsHdr(renderer)).toBe(expected);
  });
});
