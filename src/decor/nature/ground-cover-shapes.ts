import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { randomGenerator } from "../common";

/** Loose triangles with an upward normal: lit like the surrounding ground. */
function flatShadedGeometry(positions: number[], colors: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const normals = new Float32Array(positions.length);
  for (let index = 1; index < normals.length; index += 3) normals[index] = 1;
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return geometry;
}

/**
 * Tuft of thin, fan-shaped blades. The base has the color of the ground and
 * the tip is lighter, so the tuft grows out of the terrain without a visible
 * outline.
 */
export function grassTuftGeometry(base: number, tip: number, blades = 6): THREE.BufferGeometry {
  const random = randomGenerator(9187);
  const baseColor = new THREE.Color(base);
  const tipColor = new THREE.Color(tip);
  const positions: number[] = [];
  const colors: number[] = [];
  for (let blade = 0; blade < blades; blade++) {
    const angle = (blade / blades) * Math.PI * 2 + random() * 0.8;
    const radius = 0.03 + random() * 0.08;
    const height = 0.28 + random() * 0.24;
    const lean = 0.06 + random() * 0.14;
    const halfWidth = 0.032 + random() * 0.014;
    const outX = Math.cos(angle);
    const outZ = Math.sin(angle);
    const x = outX * radius;
    const z = outZ * radius;
    // Width perpendicular to the lean: the blade opens into a fan.
    positions.push(
      x - outZ * halfWidth, 0, z + outX * halfWidth,
      x + outZ * halfWidth, 0, z - outX * halfWidth,
      x + outX * lean, height, z + outZ * lean,
    );
    colors.push(...baseColor.toArray(), ...baseColor.toArray(), ...tipColor.toArray());
  }
  return flatShadedGeometry(positions, colors);
}

/**
 * Thin-stemmed flower: five white petals (tinted per instance), a yellow
 * center and a dark green stem, which stays dark with any tint.
 */
export function flowerGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const petal = [1, 1, 1];
  const heart = [1, 0.84, 0.32];
  const stem = [0.24, 0.42, 0.2];
  const y = 0.28;
  for (const angle of [0, Math.PI / 2]) {
    const dx = Math.cos(angle) * 0.012;
    const dz = Math.sin(angle) * 0.012;
    positions.push(-dx, 0, -dz, dx, 0, dz, 0, y, 0);
    colors.push(...stem, ...stem, ...stem);
  }
  for (let index = 0; index < 5; index++) {
    const a = (index / 5) * Math.PI * 2;
    const left = a - 0.45;
    const right = a + 0.45;
    positions.push(
      Math.cos(a) * 0.03, y, Math.sin(a) * 0.03,
      Math.cos(right) * 0.115, y + 0.03, Math.sin(right) * 0.115,
      Math.cos(left) * 0.115, y + 0.03, Math.sin(left) * 0.115,
    );
    colors.push(...petal, ...petal, ...petal);
    const next = a + (Math.PI * 2) / 5;
    positions.push(
      0, y + 0.014, 0,
      Math.cos(next) * 0.036, y + 0.01, Math.sin(next) * 0.036,
      Math.cos(a) * 0.036, y + 0.01, Math.sin(a) * 0.036,
    );
    colors.push(...heart, ...heart, ...heart);
  }
  return flatShadedGeometry(positions, colors);
}

/** Flat, faceted stone, half buried. */
export function pebbleGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  geometry.scale(1, 0.55, 0.8);
  geometry.translate(0, 0.18, 0);
  return geometry;
}

/** Overlapping lobes, light on top and dark at the bottom, like the crowns. */
function lobedCrown(
  lobes: readonly (readonly [number, number, number, number, number])[],
  detail: number,
  colors: { readonly top: number; readonly middle: number; readonly bottom: number },
): THREE.BufferGeometry {
  const parts = lobes.map(([x, y, z, width, height], index) => {
    const geometry = new THREE.IcosahedronGeometry(1, detail);
    geometry.rotateY(index * 0.91);
    geometry.scale(width, height, width * 0.9);
    geometry.translate(x, y, z);
    const position = geometry.getAttribute("position");
    const values: number[] = [];
    for (let vertex = 0; vertex < position.count; vertex++) {
      const upper = (position.getY(vertex) - y) / height;
      const hex = upper > 0.35 ? colors.top : upper < -0.35 ? colors.bottom : colors.middle;
      values.push(...new THREE.Color(hex).toArray());
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
    return geometry;
  });
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((part) => part.dispose());
  return merged;
}

const LEAF_TONES = { top: 0xd5df9a, middle: 0xb3c88c, bottom: 0x819c75 };

/** Low three-lobed bush, about 1 m in radius and about 1 m tall. */
export function bushGeometry(): THREE.BufferGeometry {
  return lobedCrown([
    [0, 0.55, 0, 0.95, 0.7],
    [-0.7, 0.4, 0.25, 0.7, 0.5],
    [0.65, 0.42, -0.2, 0.72, 0.55],
  ], 1, LEAF_TONES);
}

/** Distant, inexpensive tree: faceted crown and trunk in the same drawing. */
export function farTreeGeometry(): THREE.BufferGeometry {
  const crown = lobedCrown([
    [0, 3.5, 0, 1.6, 1.5],
    [-0.9, 2.9, 0.3, 1.2, 1.1],
    [0.85, 3.05, -0.25, 1.25, 1.15],
  ], 0, LEAF_TONES);
  return withTrunk(crown, 2.4);
}

/** Distant conifer: three stacked cones, to vary the silhouette of the woods. */
export function farConiferGeometry(): THREE.BufferGeometry {
  const parts = [[2.2, 1.7, 2.6], [3.4, 1.35, 2.2], [4.5, 0.95, 1.8]].map(([y, radius, height]) => {
    const cone = new THREE.ConeGeometry(radius, height, 7, 1, true);
    cone.translate(0, y, 0);
    const position = cone.getAttribute("position");
    const values: number[] = [];
    for (let vertex = 0; vertex < position.count; vertex++) {
      const upper = (position.getY(vertex) - y) / height;
      values.push(...new THREE.Color(upper > 0.2 ? 0x9fbd84 : 0x6f8f68).toArray());
    }
    cone.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
    return cone.toNonIndexed();
  });
  const crown = mergeGeometries(parts, false)!;
  parts.forEach((part) => part.dispose());
  return withTrunk(crown, 1.6);
}

function withTrunk(crown: THREE.BufferGeometry, height: number): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.2, 0.3, height, 5, 1, true).toNonIndexed();
  trunk.translate(0, height / 2, 0);
  const brown = new THREE.Color(0x88613e).toArray();
  const values: number[] = [];
  const count = trunk.getAttribute("position").count;
  for (let vertex = 0; vertex < count; vertex++) values.push(...brown);
  trunk.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
  trunk.deleteAttribute("uv");
  const flatCrown = crown.index ? crown.toNonIndexed() : crown;
  flatCrown.deleteAttribute("uv");
  const merged = mergeGeometries([trunk, flatCrown], false)!;
  trunk.dispose();
  flatCrown.dispose();
  return merged;
}
