import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { celMaterial } from "../../rendering/cel-shading";
import { createInstancedOutline } from "../../rendering/instanced-outline";
import { applyWind, windDepthMaterial, type WindOptions } from "../../rendering/wind";
import { batch } from "../common";

export type TreeVariant = "round" | "spreading" | "column";
export interface TreeSpot {
  x: number;
  /** Altura do chão; omitida, 0. */
  y?: number;
  z: number;
  scale: number;
  rotation: number;
  foliage: "a" | "b";
  variant?: TreeVariant;
}

const variants: readonly TreeVariant[] = ["round", "spreading", "column"];
const crowns = new Map<TreeVariant, THREE.BufferGeometry>();
const trunk = new THREE.CylinderGeometry(0.2, 0.32, 2.65, 7);
trunk.translate(0, 1.325, 0);
const trunkMaterial = celMaterial(0x88613e);
const foliageMaterial = celMaterial(0xffffff);
foliageMaterial.vertexColors = true;
/** Só a copa balança; o tronco termina em 2,65 m e fica parado. */
const CROWN_WIND: WindOptions = { strength: 0.13, from: 2.3, to: 5, speed: 1.1 };
applyWind(foliageMaterial, CROWN_WIND);
const crownDepthMaterial = windDepthMaterial(CROWN_WIND);

/** Overlapping, asymmetric lobes give each silhouette a painted crown. */
function crown(variant: TreeVariant): THREE.BufferGeometry {
  const cached = crowns.get(variant);
  if (cached) return cached;
  // x/y/z, horizontal radius, vertical radius
  const lobes = variant === "spreading"
    ? [[0, 3.35, 0, 1.7, 1.05], [-1.25, 2.9, 0.2, 1.3, 0.85],
      [1.15, 3.1, 0.15, 1.35, 0.95], [0.15, 3, -1, 1.25, 0.9]]
    : variant === "column"
      ? [[0, 3.8, 0, 1.1, 1.75], [-0.65, 2.8, 0.15, 0.9, 1.1],
        [0.65, 3.2, -0.2, 0.9, 1.25]]
      : [[0, 3.55, 0, 1.45, 1.4], [-0.95, 2.9, 0.15, 1.15, 1.05],
        [0.9, 3.05, 0.25, 1.15, 1.15], [0.15, 2.95, -0.85, 1.1, 1.1]];
  const parts = lobes.map(([x, y, z, width, height], index) => {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    geometry.rotateY(index * 0.73);
    geometry.scale(width, height, width * 0.9);
    geometry.translate(x, y, z);
    const position = geometry.getAttribute("position");
    const colors = [];
    for (let vertex = 0; vertex < position.count; vertex++) {
      const upper = (position.getY(vertex) - y) / height;
      const color = new THREE.Color(upper > 0.35 ? 0xd5df9a : upper < -0.35 ? 0x819c75 : 0xb3c88c);
      colors.push(color.r, color.g, color.b);
    }
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
  parent.add(createInstancedOutline(trunks, 0.7));
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
