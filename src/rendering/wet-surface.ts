import * as THREE from "three/webgpu";
import {
  float,
  max,
  mix,
  normalView,
  positionViewDirection,
  pow,
  smoothstep,
  texture,
  uniform,
  vec2,
} from "three/tsl";
import { macroNoiseTexture } from "./macro-noise";

/** Rain-soaked finish for a course's ground: `sheen` is the sky color puddles mirror. */
export interface WetFinish {
  readonly sheen: number;
}

/** Wet paint brightness, overall and inside puddles. */
const DAMP_SHADE = 0.8;
const PUDDLE_SHADE = 0.55;
/** Grazing-angle mirror strength on damp ground and in puddles. */
const DAMP_SHEEN = 0.22;
const PUDDLE_SHEEN = 0.9;
const FRESNEL_POWER = 4;

/**
 * Puddles, 0 (damp) to 1 (standing water): irregular patches a few meters
 * across, from the shared macro noise. Shared by the ground paint and the
 * light streaks, so reflections gather in the same water.
 */
export function puddleMask(world: THREE.Node<"vec2">): THREE.Node<"float"> {
  const macro = texture(macroNoiseTexture());
  const rotated = vec2(
    world.x.mul(0.6).add(world.y.mul(0.8)),
    world.x.mul(-0.8).add(world.y.mul(0.6)),
  );
  const noise = texture(macro, rotated.mul(0.045).add(vec2(0.27, 0.41))).r.mul(0.7)
    .add(texture(macro, world.mul(0.13)).r.mul(0.3));
  return smoothstep(0.56, 0.64, noise);
}

/** Paint multiplier: wet ground is darker, standing water darker still. */
export function wetShade(puddle: THREE.Node<"float">): THREE.Node<"float"> {
  return mix(float(DAMP_SHADE), float(DAMP_SHADE * PUDDLE_SHADE), puddle);
}

/**
 * Sky sheen added after lighting: a Fresnel mirror that brightens toward
 * grazing angles, so distant wet road glows and the road at the wheels stays dark.
 */
export function wetSheen(finish: WetFinish, puddle: THREE.Node<"float">): THREE.Node<"vec3"> {
  const facing = max(normalView.dot(positionViewDirection), 0);
  const fresnel = pow(float(1).sub(facing), FRESNEL_POWER);
  const strength = mix(float(DAMP_SHEEN), float(PUDDLE_SHEEN), puddle);
  return uniform(new THREE.Color(finish.sheen)).mul(fresnel.mul(strength));
}
