import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { celMaterial, outlinedMaterial } from "../../rendering/cel-shading";
import { addBox } from "../common";
import type { Decoration } from "../types";

const teal = outlinedMaterial(0x23685c, 0.001);
const cream = outlinedMaterial(0xffedc3, 0.0008);
const soil = celMaterial(0x55422e);
const foliage = [celMaterial(0x398249), celMaterial(0x70ad48)];
const coral = celMaterial(0xf17d59);
const gold = celMaterial(0xf5cf69);
const leafShape = new THREE.IcosahedronGeometry(1, 1);

/** Compact planter with overlapping foliage; merged by material to limit draw calls. */
export function createFestivalPlanter(): Decoration {
  const group = new THREE.Group();
  group.name = "festival-planter";
  addBox(group, 1.5, 0.55, 5, teal, 0, 0.275, 0);
  addBox(group, 1.35, 0.06, 4.8, soil, 0, 0.57, 0);
  for (const side of [-1, 1]) {
    addBox(group, 0.1, 0.12, 5.2, cream, side * 0.78, 0.57, 0);
    addBox(group, 1.65, 0.12, 0.1, cream, 0, 0.57, side * 2.55);
  }
  const leaves: THREE.BufferGeometry[][] = [[], []];
  const flowers: THREE.BufferGeometry[] = [];
  const centers: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const z = -2.1 + i * 0.52;
    for (let side = -1; side <= 1; side++) {
      const leaf = leafShape.clone();
      leaf.scale(0.35, 0.48 + (i % 3) * 0.12, 0.5);
      leaf.rotateZ(side * -0.55);
      leaf.translate(side * 0.38, 0.9, z);
      leaves[(i + side + 1) % 2].push(leaf);
    }
    if (i % 2 === 0) {
      for (let petal = 0; petal < 5; petal++) {
        const a = petal / 5 * Math.PI * 2;
        const flower = leafShape.clone();
        flower.scale(0.16, 0.09, 0.16);
        flower.translate(Math.cos(a) * 0.18, 1.35, z + Math.sin(a) * 0.18);
        flowers.push(flower);
      }
      const center = leafShape.clone();
      center.scale(0.1, 0.1, 0.1); center.translate(0, 1.4, z);
      centers.push(center);
    }
  }
  const addMerged = (parts: THREE.BufferGeometry[], material: THREE.Material): void => {
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, material);
    parts.forEach(part => part.dispose());
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  };
  leaves.forEach((parts, index) => addMerged(parts, foliage[index]));
  addMerged(flowers, coral); addMerged(centers, gold);
  return { group, colliders: [{ center: { x: 0, y: 0.3, z: 0 }, half: { x: 0.83, y: 0.3, z: 2.6 }, yaw: 0 }] };
}

/** Sculpted cloth, with vertex deformation reserved for an inexpensive breeze. */
export function createFestivalFlag(color: number): Decoration {
  const group = new THREE.Group();
  group.name = "festival-flag";
  addBox(group, 0.65, 0.25, 0.65, teal, 0, 0.125, 0);
  addBox(group, 0.1, 6.7, 0.1, cream, 0, 3.35, 0);
  const cloth = new THREE.PlaneGeometry(1.5, 3.4, 6, 10);
  const position = cloth.getAttribute("position");
  const rest = new Float32Array(position.array);
  const material = celMaterial(color);
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(cloth, material);
  mesh.userData.animated = true;
  mesh.position.set(0.8, 4.8, 0);
  group.add(mesh);
  // Cream chevrons read as race signage without adding another text panel.
  for (const y of [4.2, 4.8, 5.4]) {
    const stripe = addBox(group, 0.55, 0.11, 0.035, cream, 0.72, y, -0.12);
    stripe.rotation.z = -0.5;
  }
  let time = 0;
  return {
    group,
    colliders: [{ center: { x: 0, y: 3.35, z: 0 }, half: { x: 0.12, y: 3.35, z: 0.12 }, yaw: 0 }],
    update(dt) {
      time += dt;
      for (let i = 0; i < position.count; i++) {
        const x = rest[i * 3], y = rest[i * 3 + 1];
        position.setZ(i, Math.sin(time * 1.7 + y * 1.3 + x) * 0.12 * (x + 0.75) / 1.5);
      }
      position.needsUpdate = true;
      cloth.computeVertexNormals();
    },
  };
}
