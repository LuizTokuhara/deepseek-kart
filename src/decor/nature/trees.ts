import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { celMaterial } from "../../rendering/cel-shading";
import { createInstancedOutline } from "../../rendering/instanced-outline";
import { applyWind, windDepthMaterial, type WindOptions } from "../../rendering/wind";
import { batch } from "../common";

export type TreeVariant = "round" | "spreading" | "column";
export interface TreeSpot {
  x: number;
  /** Ground height; default 0 when omitted. */
  y?: number;
  z: number;
  scale: number;
  rotation: number;
  foliage: "a" | "b";
  variant?: TreeVariant;
}

const variants: readonly TreeVariant[] = ["round", "spreading", "column"];
const crowns = new Map<TreeVariant, THREE.BufferGeometry>();
const trunk = branchingTrunk();
const trunkMaterial = celMaterial(0xffffff);
trunkMaterial.vertexColors = true;
const foliageMaterial = celMaterial(0xffffff);
foliageMaterial.vertexColors = true;
/** Keep the roots still; branch tips and foliage share the same breeze. */
const CROWN_WIND: WindOptions = { strength: 0.13, from: 2.3, to: 5, speed: 1.1 };
applyWind(foliageMaterial, CROWN_WIND);
applyWind(trunkMaterial, CROWN_WIND);
const crownDepthMaterial = windDepthMaterial(CROWN_WIND);

/** Roots and forks are baked into the existing trunk batch, with no extra draws. */
function branchingTrunk(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const segment = (from: number[], to: number[], bottom: number, top: number) => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(top, bottom, direction.length(), 7, 1);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), direction.normalize(),
    ));
    geometry.translate(...a.add(b).multiplyScalar(0.5).toArray());
    parts.push(geometry.toNonIndexed());
    geometry.dispose();
  };
  segment([0, 0, 0], [0.08, 1.45, -0.03], 0.32, 0.23);
  segment([0.08, 1.45, -0.03], [-0.12, 2.85, 0.08], 0.23, 0.1);
  segment([0.04, 1.65, 0], [-0.72, 2.65, 0.14], 0.16, 0.07);
  segment([0, 2.05, 0], [0.8, 3.05, 0.25], 0.14, 0.055);
  segment([0, 2.25, 0], [-0.12, 3.15, -0.65], 0.12, 0.045);
  for (let root = 0; root < 5; root++) {
    const angle = root * Math.PI * 2 / 5 + 0.3;
    segment([Math.sin(angle) * 0.48, 0.04, Math.cos(angle) * 0.48],
      [0, 0.52, 0], 0.065, 0.15);
  }
  const geometry = mergeGeometries(parts, false)!;
  parts.forEach(part => part.dispose());
  const position = geometry.getAttribute("position");
  const colors: number[] = [];
  const color = new THREE.Color();
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    const grain = Math.sin(x * 13 + z * 9 + y * 0.8);
    color.setHex(grain > 0.3 ? 0xa67b4d : grain < -0.4 ? 0x745036 : 0x91653f);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/** Broad asymmetric masses, with smaller lobes breaking the outside contour. */
function crown(variant: TreeVariant): THREE.BufferGeometry {
  const cached = crowns.get(variant);
  if (cached) return cached;
  // x/y/z, horizontal radius, vertical radius
  const lobes = variant === "spreading"
    ? [[-0.15, 3.6, -0.1, 1.5, 1.0], [-1.3, 3, 0.2, 1.2, 0.8],
      [1.2, 3.2, 0.2, 1.3, 0.85], [0.15, 3.1, -1, 1.2, 0.85],
      [-0.6, 3.7, 0.65, 0.9, 0.75]]
    : variant === "column"
      ? [[-0.12, 4, 0, 0.95, 1.55], [-0.65, 2.85, 0.15, 0.85, 1.05],
        [0.6, 3.25, -0.25, 0.85, 1.15], [0.2, 4.5, 0.2, 0.65, 0.9]]
      : [[-0.15, 3.65, -0.15, 1.3, 1.3], [-0.95, 2.9, 0.15, 1.05, 0.95],
        [0.95, 3.15, 0.3, 1.05, 1.0], [0.05, 3.0, -0.85, 1.0, 1.0],
        [-0.25, 3.5, 0.8, 0.9, 0.9]];
  const parts = lobes.map(([x, y, z, width, height], index) => {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    geometry.rotateY(index * 0.73);
    const position = geometry.getAttribute("position");
    const colors: number[] = [];
    const color = new THREE.Color();
    for (let vertex = 0; vertex < position.count; vertex++) {
      const px = position.getX(vertex), py = position.getY(vertex), pz = position.getZ(vertex);
      // Position-based distortion keeps duplicate vertices together at every seam.
      const ripple = 1 + 0.09 * Math.sin(px * 5 + index) * Math.cos(pz * 4 - py * 3);
      position.setXYZ(vertex, x + px * width * ripple,
        y + py * height * ripple, z + pz * width * 0.9 * ripple);
      color.setHex(py > 0.35 ? 0xd5df9a : py < -0.35 ? 0x819c75 : 0xb3c88c);
      color.multiplyScalar(0.96 + 0.04 * Math.sin(px * 4 + pz * 3 + index));
      colors.push(color.r, color.g, color.b);
    }
    geometry.computeVertexNormals();
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  });
  const geometry = mergeGeometries(parts, false)!;
  parts.forEach((part) => part.dispose());
  crowns.set(variant, geometry);
  return geometry;
}

/**
 * Shared prototypes and instance colors keep variety independent of tree count.
 * Distant belts can skip `shadows`: they sit beyond the real shadow map anyway.
 */
export function buildTrees(spots: readonly TreeSpot[], parent: THREE.Group, shadows = true): void {
  if (!spots.length) return;
  const placement = (tree: TreeSpot) => ({ ...tree, y: tree.y ?? 0, yaw: tree.rotation });
  const trunks = batch(parent, trunk, trunkMaterial, spots.map(placement), shadows);
  trunks.name = "tree-trunks";
  trunks.customDepthMaterial = crownDepthMaterial;
  const trunkOutline = createInstancedOutline(trunks, 0.7);
  applyWind(trunkOutline.material as THREE.Material, CROWN_WIND);
  parent.add(trunkOutline);
  variants.forEach((variant, variantIndex) => {
    const trees = spots.filter((tree) => (tree.variant ?? variants[
      Math.abs(Math.floor(tree.x * 3 + tree.z * 7)) % variants.length
    ]) === variant);
    if (!trees.length) return;
    const mesh = batch(parent, crown(variant), foliageMaterial, trees.map(placement), shadows);
    mesh.name = `tree-crowns-${variant}`;
    mesh.customDepthMaterial = crownDepthMaterial;
    trees.forEach((tree, index) => {
      const color = new THREE.Color(tree.foliage === "a" ? 0x619849 : 0x83ab51);
      color.offsetHSL(variantIndex * 0.008, 0, Math.sin(tree.x + tree.z) * 0.025);
      mesh.setColorAt(index, color);
    });
    mesh.instanceColor!.needsUpdate = true;
    const outline = createInstancedOutline(mesh, 0.8);
    applyWind(outline.material as THREE.Material, CROWN_WIND);
    parent.add(outline);
  });
}
