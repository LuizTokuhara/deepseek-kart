import * as THREE from "three";
import { terrainMaterial } from "../../../rendering/terrain-material";
import type { TrackLike } from "../../track";
import type { PyramidPlacement } from "./monuments";

export const SUNSTONE_PYRAMIDS: readonly PyramidPlacement[] = [
  { x: -125, z: -20, base: 60, height: 46, rotation: Math.PI / 2, door: true },
  { x: -10, z: -130, base: 56, height: 42 },
  { x: 128, z: 86, base: 48, height: 36 },
  { x: 45, z: 3, base: 10, height: 12, door: false },
  { x: 95, z: 25, base: 22, height: 16 },
  { x: -105, z: -105, base: 30, height: 22 },
  { x: 100, z: -120, base: 28, height: 20 },
  { x: -110, z: 80, base: 26, height: 20 },
];

export function distanceToRoute(track: TrackLike, x: number, z: number): number {
  let closest = Infinity;
  for (let i = 0; i < track.path.length; i++) {
    const a = track.path[i], b = track.path[(i + 1) % track.path.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / Math.max(0.001, dx * dx + dz * dz), 0, 1);
    closest = Math.min(closest, (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2);
  }
  return Math.sqrt(closest);
}

/** Long, wind-aligned ridges with gentle windward slopes and steep slip faces.
 * A single continuous heightfield replaces the disconnected hemisphere props. */
export function desertHeight(track: TrackLike, x: number, z: number): number {
  const roadClearance = THREE.MathUtils.smoothstep(distanceToRoute(track, x, z), 19, 43);
  const outerDesert = THREE.MathUtils.smoothstep(Math.hypot(x * 0.95, z), 82, 136);
  let clearing = 1;
  for (const pyramid of SUNSTONE_PYRAMIDS) {
    const dx = Math.max(0, Math.abs(x - pyramid.x) - pyramid.base / 2 - 2);
    const dz = Math.max(0, Math.abs(z - pyramid.z) - pyramid.base / 2 - 2);
    clearing = Math.min(clearing, THREE.MathUtils.smoothstep(Math.hypot(dx, dz), 0, 16));
  }
  const wind = x * 0.86 + z * 0.51;
  const cross = -x * 0.51 + z * 0.86;
  const phase = THREE.MathUtils.euclideanModulo((wind + Math.sin(cross * 0.027) * 19 + Math.sin(cross * 0.066) * 4) / 76, 1);
  const crest = phase < 0.73 ? (phase / 0.73) ** 1.6 : ((1 - phase) / 0.27) ** 0.85;
  const height = 4 + crest * (16 + Math.sin(cross * 0.022 + 1) * 6);
  return -0.12 + height * roadClearance * outerDesert * clearing;
}

export function buildDuneLandscape(track: TrackLike): THREE.Mesh {
  const extent = 280, segments = 160;
  const geometry = new THREE.PlaneGeometry(extent * 2, extent * 2, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const clearance = new Float32Array(position.count);
  const light = new THREE.Color(0xffe3ac), shade = new THREE.Color(0xd5a269), color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const height = desertHeight(track, x, z);
    clearance[i] = distanceToRoute(track, x, z);
    position.setY(i, height);
    color.copy(shade).lerp(light, THREE.MathUtils.clamp(0.45 + height / 40, 0, 1));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  // Banked road shoulders can sit below zero. Leave an actual opening around
  // the route rather than laying a flat sand mesh over those lower sections.
  const original = geometry.getIndex()!;
  const indices: number[] = [];
  for (let i = 0; i < original.count; i += 3) {
    const a = original.getX(i), b = original.getX(i + 1), c = original.getX(i + 2);
    if (Math.min(clearance[a], clearance[b], clearance[c]) > 18) indices.push(a, b, c);
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = terrainMaterial(0xffffff, "sand");
  material.vertexColors = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "wind-carved-dune-landscape";
  mesh.receiveShadow = true;
  return mesh;
}
