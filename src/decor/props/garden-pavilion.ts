import * as THREE from "three";
import { addBox } from "../common";
import type { Decoration } from "../types";
import { mergeStaticDecoration } from "../merge-static";
import { celMaterial, outlinedMaterial } from "../../rendering/cel-shading";
import { signMaterial } from "./signs";

/** Open garden pavilion. Local +Z is the front; colliders are local to the model. */
export function createGardenPavilion(label: string): Decoration {
  const group = new THREE.Group();
  group.name = "garden-pavilion";
  const cream = outlinedMaterial(0xffedc3, 0.0008);
  const teal = outlinedMaterial(0x23685c, 0.001);
  const coral = outlinedMaterial(0xcd674b, 0.001);
  const tileSeam = celMaterial(0xe19772);
  const brace = (x: number, z: number, dx: number, dz: number): void => {
    const from = new THREE.Vector3(x, 3.55, z);
    const to = new THREE.Vector3(x + dx, 4.6, z + dz);
    const direction = to.clone().sub(from);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, direction.length(), 0.16), teal);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    group.add(mesh);
  };
  addBox(group, 8.8, 0.3, 6.8, cream, 0, 0.15, 0);
  addBox(group, 8.2, 0.18, 6.2, teal, 0, 0.39, 0);
  for (const x of [-3.5, 3.5]) {
    for (const z of [-2.5, 2.5]) {
      addBox(group, 0.32, 4.6, 0.32, cream, x, 2.65, z);
      addBox(group, 0.55, 0.6, 0.55, teal, x, 0.75, z);
      addBox(group, 0.62, 0.12, 0.62, cream, x, 1.08, z);
      addBox(group, 0.58, 0.2, 0.58, teal, x, 4.63, z);
      brace(x, z, -Math.sign(x) * 0.9, 0);
      brace(x, z, 0, -Math.sign(z) * 0.9);
    }
  }
  for (const side of [-1, 1]) {
    addBox(group, 7.3, 0.24, 0.22, teal, 0, 4.65, side * 2.5);
    addBox(group, 0.22, 0.24, 5.2, teal, side * 3.5, 4.65, 0);
    addBox(group, 0.12, 0.12, 3.3, teal, side * 3.5, 1.45, -0.7);
    for (let post = 0; post < 6; post++) {
      addBox(group, 0.075, 1.0, 0.075, cream, side * 3.5, 0.98, -2.2 + post * 0.58);
    }
  }
  // Two pitched roof planes with a raised ridge and cream eaves.
  const slope = 0.32;
  for (const side of [-1, 1]) {
    const roof = addBox(group, 9.8, 0.22, 4.1, coral, 0, 5.15, side * 1.94);
    roof.rotation.x = side * slope;
    addBox(group, 10, 0.16, 0.2, cream, 0, 4.52, side * 3.9);
    for (let seam = 0; seam < 8; seam++) {
      const strip = addBox(group, 0.06, 0.035, 4.1, tileSeam,
        -4.55 + seam * 1.3, 5.27, side * 1.975);
      strip.rotation.x = side * slope;
    }
  }
  addBox(group, 10, 0.22, 0.3, teal, 0, 5.82, 0);
  addBox(group, 6.7, 0.95, 0.22, teal, 0, 4.05, 2.65);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 0.75), signMaterial(label, "tropical"));
  sign.position.set(0, 4.05, 2.77);
  group.add(sign);
  for (const x of [-2.2, 2.2]) {
    addBox(group, 2.4, 0.18, 0.7, teal, x, 1, -1.5);
    addBox(group, 2.4, 0.45, 0.12, teal, x, 1.34, -1.8);
    for (const dx of [-0.85, 0.85]) addBox(group, 0.16, 0.55, 0.5, cream, x + dx, 0.7, -1.5);
  }
  mergeStaticDecoration(group);
  return { group, colliders: [{ center: { x: 0, y: 0.25, z: 0 },
    half: { x: 4.4, y: 0.25, z: 3.4 }, yaw: 0 }] };
}
