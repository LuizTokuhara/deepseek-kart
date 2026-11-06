import * as THREE from "three";

/**
 * Linear luminance where bloom starts. Lit toon paint peaks around 1.0, and the
 * kart rim band can push white paint to ~1.4, so normal surfaces never bloom.
 */
export const BLOOM_THRESHOLD = 1.6;
/** Luminance range over which bloom fades in above the threshold. */
export const BLOOM_KNEE = 0.4;
/** Default luminance for light sources: clears threshold + knee with margin. */
export const GLOW_LUMINANCE = 2.6;

/** Rec. 709 luminance of a linear color, matching three's shader `luminance()`. */
export function linearLuminance(color: THREE.Color): number {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}

/**
 * Scales a paint color into HDR so it feeds bloom while keeping its hue.
 * The final pass divides by the peak channel, so the surface itself still
 * displays its original paint color; only the halo reveals the extra energy.
 */
export function glowColor(
  hex: number,
  luminance = GLOW_LUMINANCE,
  target = new THREE.Color(),
): THREE.Color {
  target.setHex(hex);
  const current = linearLuminance(target);
  return current > 0 ? target.multiplyScalar(luminance / current) : target;
}
