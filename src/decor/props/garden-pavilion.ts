import * as THREE from "three";
import { addBox } from "../common";
import type { Decoration } from "../types";
import { outlinedMaterial } from "../../rendering/cel-shading";
import { signMaterial } from "./signs";

/** Open garden pavilion. Local +Z is the front; colliders are local to the model. */
export function createGardenPavilion(label: string): Decoration {
  const group = new THREE.Group();
  group.name = "garden-pavilion";
  const cream = outlinedMaterial(0xffedc3, 0.0008);
  const teal = outlinedMaterial(0x23685c, 0.001);
  const coral = outlinedMaterial(0xcd674b, 0.001);
  addBox(group, 8.8, 0.3, 6.8, cream, 0, 0.15, 0);
  addBox(group, 8.2, 0.18, 6.2, teal, 0, 0.39, 0);
  for (const x of [-3.5, 3.5]) {
    for (const z of [-2.5, 2.5]) {
      addBox(group, 0.32, 4.6, 0.32, cream, x, 2.65, z);
      addBox(group, 0.55, 0.6, 0.55, teal, x, 0.75, z);
    }
  }
  // Two pitched roof planes with a raised ridge and cream eaves.
  const slope = 0.32;
  for (const side of [-1, 1]) {
    const roof = addBox(group, 9.8, 0.22, 4.1, coral, 0, 5.15, side * 1.94);
    roof.rotation.x = side * slope;
    addBox(group, 10, 0.16, 0.2, cream, 0, 4.52, side * 3.9);
  }
  addBox(group, 10, 0.22, 0.3, teal, 0, 5.82, 0);
  addBox(group, 6.7, 0.95, 0.22, teal, 0, 4.05, 2.65);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 0.75), signMaterial(label, "tropical"));
  sign.position.set(0, 4.05, 2.77);
  group.add(sign);
  for (const x of [-2.2, 2.2]) {
    addBox(group, 2.4, 0.18, 0.7, teal, x, 1, -1.5);
    for (const dx of [-0.85, 0.85]) addBox(group, 0.16, 0.55, 0.5, cream, x + dx, 0.7, -1.5);
  }
  return { group, colliders: [{ center: { x: 0, y: 0.25, z: 0 },
    half: { x: 4.4, y: 0.25, z: 3.4 }, yaw: 0 }] };
}
