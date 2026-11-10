import * as THREE from "three/webgpu";
import {
  abs,
  attribute,
  cameraPosition,
  exp,
  float,
  length,
  max,
  normalize,
  positionWorld,
  pow,
  smoothstep,
  texture,
  vec2,
  vec3,
} from "three/tsl";
import { macroNoiseTexture } from "./macro-noise";
import { puddleMask } from "./wet-surface";

/** A light that mirrors on wet ground. */
export interface ReflectedLight {
  /** Light source, in world coordinates. */
  readonly position: THREE.Vector3;
  /** Height of the wet ground beneath it. */
  readonly groundY: number;
  readonly color: THREE.ColorRepresentation;
  /** Streak width across the view, in meters (roughly the lamp's size). */
  readonly width: number;
  /** Brightness of the streak core; keep below 1 so only neon tips bloom. */
  readonly intensity: number;
}

/** Half length of a streak along the view, in meters. */
const STREAK_LENGTH = 5.5;
/** Distance from the camera at which a streak reaches its full length. */
const STREAK_FULL_DISTANCE = 15;
/** Streaks fade out between these distances from the camera, in meters. */
const FADE_NEAR = 30;
const FADE_FAR = 75;
/** Sharpness of the grazing-angle falloff. */
const FRESNEL_POWER = 8;
/** Fraction of the streak that survives outside puddles. */
const DAMP_REFLECTION = 0.4;

/**
 * Fake wet-asphalt reflections: one ground quad per light, placed where a
 * mirror would show it (on the line from the camera to the light's mirror
 * image) and stretched toward the camera, the way a rough wet surface smears
 * lights into vertical streaks. All placement happens in the vertex shader,
 * so the streaks follow the camera with no per-frame CPU work.
 */
export function createWetReflections(lights: readonly ReflectedLight[]): THREE.Mesh {
  const count = lights.length;
  const position = new Float32Array(count * 4 * 3);
  const light = new Float32Array(count * 4 * 3);
  const ground = new Float32Array(count * 4);
  const corner = new Float32Array(count * 4 * 2);
  const tint = new Float32Array(count * 4 * 3);
  const width = new Float32Array(count * 4);
  const index: number[] = [];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const color = new THREE.Color();
  lights.forEach((source, i) => {
    color.set(source.color).multiplyScalar(source.intensity);
    corners.forEach(([u, v], c) => {
      const vertex = i * 4 + c;
      position.set([source.position.x, source.groundY, source.position.z], vertex * 3);
      light.set([source.position.x, source.position.y, source.position.z], vertex * 3);
      ground[vertex] = source.groundY;
      corner.set([u, v], vertex * 2);
      tint.set([color.r, color.g, color.b], vertex * 3);
      width[vertex] = source.width;
    });
    const base = i * 4;
    index.push(base, base + 2, base + 1, base, base + 3, base + 2);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("light", new THREE.BufferAttribute(light, 3));
  geometry.setAttribute("ground", new THREE.BufferAttribute(ground, 1));
  geometry.setAttribute("corner", new THREE.BufferAttribute(corner, 2));
  geometry.setAttribute("tint", new THREE.BufferAttribute(tint, 3));
  geometry.setAttribute("streakWidth", new THREE.BufferAttribute(width, 1));
  geometry.setIndex(index);

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // A light offset: a slope-scaled one would lift far, grazing streaks through walls.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    // Additive fog would add the haze color; `fade` dims distant streaks instead.
    fog: false,
  });
  material.userData.outlineParameters = { visible: false };

  const lightPosition = attribute<"vec3">("light", "vec3");
  const groundY = attribute<"float">("ground", "float");
  const uv = attribute<"vec2">("corner", "vec2");
  // Mirror point: where the camera's ray to the light's reflection meets the ground.
  const cameraHeight = max(cameraPosition.y.sub(groundY), 0.3);
  const lightHeight = max(lightPosition.y.sub(groundY), 0.1);
  const along = cameraHeight.div(cameraHeight.add(lightHeight));
  const mirror = cameraPosition.xz.add(lightPosition.xz.sub(cameraPosition.xz).mul(along));
  const toCamera = cameraPosition.xz.sub(mirror);
  const distance = length(toCamera);
  const forward = normalize(toCamera.add(vec2(0.0001, 0)));
  // Right-handed with `forward`, so the quads face up and survive back-face culling.
  const side = vec2(forward.y, forward.x.negate());
  const footprint = mirror
    .add(side.mul(uv.x.mul(attribute<"float">("streakWidth", "float"))))
    // Close to the camera a streak is seen from above and stays short.
    .add(forward.mul(uv.y.mul(STREAK_LENGTH).mul(distance.div(STREAK_FULL_DISTANCE).clamp(0.3, 1))));
  material.positionNode = vec3(footprint.x, groundY.add(0.03), footprint.y);
  // Distant streaks dim out; a camera below the wet ground (under the overpass
  // deck) cannot see its reflections at all.
  // Fresnel: water only mirrors at grazing angles, so streaks near the wheels
  // and seen from above stay faint while those down the street shine.
  const grazing = distance.div(length(vec2(distance, cameraHeight)));
  const fade = float(1).sub(smoothstep(FADE_NEAR, FADE_FAR, distance))
    .mul(smoothstep(0.2, 0.8, cameraPosition.y.sub(groundY)))
    .mul(pow(grazing, FRESNEL_POWER))
    .toVarying("streakFade");

  // Bright core fading along the streak, broken up by the water on the ground.
  const across = exp(uv.x.mul(uv.x).mul(-2.6));
  const lengthwise = float(1).sub(smoothstep(0.25, 1, abs(uv.y)));
  const ripple = smoothstep(0.2, 0.75, texture(macroNoiseTexture(), positionWorld.xz.mul(0.42)).r)
    .mul(0.6).add(0.4);
  const water = puddleMask(positionWorld.xz).mul(1 - DAMP_REFLECTION).add(DAMP_REFLECTION);
  material.colorNode = attribute<"vec3">("tint", "vec3")
    .mul(across.mul(lengthwise).mul(ripple).mul(water).mul(fade));

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "wet-light-reflections";
  // Vertices move with the camera in the shader; bounds would be wrong.
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}
