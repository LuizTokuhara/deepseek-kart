import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { blendFogInSrgb } from "../src/rendering/srgb-fog";

describe("blendFogInSrgb", () => {
  it("should replace the linear fog mix with an sRGB-space mix", () => {
    blendFogInSrgb();

    const chunk = THREE.ShaderChunk.fog_fragment;
    expect(chunk).not.toContain("mix( gl_FragColor.rgb, fogColor, fogFactor )");
    expect(chunk).toContain("sRGBTransferOETF( vec4( fogColor, 1.0 ) )");
  });

  it("should be idempotent when several games are created", () => {
    blendFogInSrgb();
    const once = THREE.ShaderChunk.fog_fragment;

    blendFogInSrgb();

    expect(THREE.ShaderChunk.fog_fragment).toBe(once);
  });
});
