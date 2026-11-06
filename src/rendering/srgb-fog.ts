import * as THREE from "three";

const LINEAR_FOG_BLEND = "gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );";
// Clamps first: the sRGB curve uses pow(), which turns slightly negative colors
// (e.g. painted-water glints) into NaN, and bloom would smear NaN across the frame.
const SRGB_FOG_BLEND = `gl_FragColor.rgb = sRGBTransferEOTF( vec4( mix(
		sRGBTransferOETF( vec4( max( gl_FragColor.rgb, 0.0 ), 1.0 ) ).rgb,
		sRGBTransferOETF( vec4( fogColor, 1.0 ) ).rgb,
		fogFactor ), 1.0 ) ).rgb;`;

/**
 * Course fog was art-directed while three rendered straight to the canvas,
 * where fog is mixed after sRGB encoding. Render targets output linear color,
 * which makes mid-distance haze visibly paler; mixing in sRGB keeps the tuned
 * look. Must run before the first render compiles any program. Idempotent.
 */
export function blendFogInSrgb(): void {
  const chunk = THREE.ShaderChunk.fog_fragment;
  if (chunk.includes(SRGB_FOG_BLEND)) return;
  if (!chunk.includes(LINEAR_FOG_BLEND)) {
    throw new Error("three.js fog_fragment changed; review blendFogInSrgb()");
  }
  THREE.ShaderChunk.fog_fragment = chunk.replace(LINEAR_FOG_BLEND, SRGB_FOG_BLEND);
}
