import * as THREE from "three/webgpu";
import {
  abs,
  diffuseColor,
  float,
  fract,
  luminance,
  max,
  positionView,
  screenCoordinate,
  screenDPR,
  smoothstep,
  uniform,
} from "three/tsl";

/** Comic hatching in shadow; sizes are CSS pixels, distances meters. */
export const HATCHING = {
  /** Gap between parallel strokes. */
  spacing: 6,
  /** Stroke width. */
  width: 1.3,
  /** How much a stroke darkens the paint under it, 0..1. */
  darkness: 0.42,
  /**
   * Light level (sun-lit paint = 1) where single strokes start and are full;
   * the scenery ramp's shadow band sits at 0.24, its midtone at 0.57.
   */
  single: [0.45, 0.32],
  /** Deeper level where the crossing strokes come in (cast shadows). */
  cross: [0.2, 0.1],
  /** Strokes fade out between these view distances, before they turn to moiré. */
  fadeFrom: 28,
  fadeTo: 60,
} as const;

/**
 * Luminance of the key light (sun or moon), as color × intensity. Environment
 * sets it, so the light level below reads 1 on fully sun-lit paint whatever
 * the course's sun strength.
 */
export const keyLight = uniform(1);

/** One family of diagonal strokes in screen space: 1 on a stroke, 0 between. */
function strokes(direction: 1 | -1): THREE.Node<"float"> {
  const pixel = screenCoordinate.xy.div(screenDPR);
  const along = pixel.x.add(pixel.y.mul(direction)).div(HATCHING.spacing);
  // Perpendicular distance to the stroke center, in pixels (diagonal = /√2).
  const distance = abs(fract(along).sub(0.5)).mul(HATCHING.spacing / Math.SQRT2);
  const half = HATCHING.width / 2;
  return smoothstep(half + 0.6, half - 0.6, distance);
}

/**
 * Multiplier for the lit color: 1 in the light, darker along ink strokes in
 * shadow, with a second crossing family in the deepest shade. `direct` is the
 * accumulated direct diffuse light, read after every light has been added.
 */
export function hatchShade(direct: THREE.Node<"vec3">): THREE.Node<"float"> {
  // BRDF_Lambert divides by π: full sun on this paint gives diffuse × key / π.
  const sunlit = max(luminance(diffuseColor.rgb).mul(keyLight).div(Math.PI), float(0.0001));
  const level = luminance(direct).div(sunlit);
  const near = smoothstep(HATCHING.fadeTo, HATCHING.fadeFrom, positionView.z.negate());
  const single = smoothstep(HATCHING.single[0], HATCHING.single[1], level).mul(strokes(1));
  const cross = smoothstep(HATCHING.cross[0], HATCHING.cross[1], level).mul(strokes(-1));
  const ink = max(single, cross).mul(near);
  return float(1).sub(ink.mul(HATCHING.darkness));
}
