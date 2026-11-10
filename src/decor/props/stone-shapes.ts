import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { randomGenerator } from "../common";

/** Angular, layered boulder inside a unit box; colors multiply the local rock palette. */
export function boulderGeometry(seed = 173): THREE.BufferGeometry {
  const random = randomGenerator(seed);
  const points: THREE.Vector3[] = [];
  const lean = (random() - 0.5) * 0.35;
  const profile = Math.abs(seed) % 3;
  const heightScale = profile === 0 ? 0.65 : profile === 1 ? 0.85 : 1;
  for (const [y, radius, count] of [[-0.7, 0.75, 8], [0.05, 0.94, 9], [0.64, 0.59, 7]]) {
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2 + y * 0.7;
      const reach = radius * (0.82 + random() * 0.18);
      points.push(new THREE.Vector3(
        Math.cos(angle) * reach + lean * (y + 0.7),
        y + (random() - 0.5) * 0.2,
        Math.sin(angle) * reach * (0.85 + random() * 0.15),
      ).clampScalar(-1, 1));
    }
  }
  if (profile !== 0) {
    points.push(new THREE.Vector3(lean - 0.18, 0.8, -0.12));
    points.push(new THREE.Vector3(lean + 0.22, 0.76, 0.15));
  }
  for (const point of points) {
    point.y = -0.7 + (point.y + 0.7) * heightScale;
    if (profile === 2) point.z *= 0.75;
    const reach = Math.hypot(point.x, point.z);
    if (reach > 1) { point.x /= reach; point.z /= reach; }
  }
  const geometry = new ConvexGeometry(points);
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const colors: number[] = [];
  const uv: number[] = [];
  for (let index = 0; index < position.count; index += 3) {
    const y = (position.getY(index) + position.getY(index + 1) + position.getY(index + 2)) / 3;
    const band = y > 0.1 && y < 0.35 ? 0.78 : 1;
    const value = (0.84 + normal.getY(index) * 0.13) * band;
    for (let corner = 0; corner < 3; corner++) {
      colors.push(value, value * 0.98, value * 0.94);
      uv.push(position.getX(index + corner) * 0.5 + 0.5, position.getY(index + corner) * 0.5 + 0.5);
    }
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const chips = [-1, 1].map(side => {
    const chip = new THREE.IcosahedronGeometry(0.17, 0);
    chip.rotateY(seed * 0.3);
    chip.scale(1, 0.7, 0.8);
    chip.translate(side * 0.66, -0.46, side * 0.38);
    const count = chip.getAttribute("position").count;
    chip.setAttribute("color", new THREE.Float32BufferAttribute(
      Array.from({ length: count * 3 }, () => 0.8), 3));
    return chip;
  });
  const merged = mergeGeometries([geometry, ...chips], false)!;
  geometry.dispose(); chips.forEach(chip => chip.dispose());
  return merged;
}

/** Broad bevels and a clipped upper corner, contained within the original block. */
export function weatheredBlockGeometry(width: number, height: number, depth: number, seed = 0): THREE.BufferGeometry {
  const radius = Math.min(width, height, depth) * 0.12;
  const geometry = new RoundedBoxGeometry(width, height, depth, 1, radius);
  const position = geometry.getAttribute("position");
  const random = randomGenerator(seed);
  const sideX = random() > 0.5 ? 1 : -1;
  const sideZ = random() > 0.5 ? 1 : -1;
  const chip = 0.14 + random() * 0.12;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    const corner = Math.max(0, x * sideX / width + z * sideZ / depth + y / height - 1 + chip);
    // Every duplicate vertex receives the same cut, so bevels remain watertight.
    position.setXYZ(index, x - sideX * corner * width * 0.28,
      y - corner * height * 0.7, z - sideZ * corner * depth * 0.28);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A fluted stone drum with an optional uneven fracture across its upper face. */
export function columnDrumGeometry(bottom: number, top: number, height: number, seed = 0, fractured = false): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(top, bottom, height, 16, 1);
  const position = geometry.getAttribute("position");
  const phase = seed * 0.73;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    const angle = Math.atan2(z, x);
    const flute = 0.96 + Math.cos(angle * 8) * 0.04;
    const breakDepth = fractured && y > 0
      ? Math.min(height * 0.4, top * 0.42) * (0.5 + 0.5 * Math.sin(angle * 3 + phase))
      : 0;
    position.setXYZ(index, x * flute, y - breakDepth, z * flute);
  }
  geometry.computeVertexNormals();
  return geometry;
}
