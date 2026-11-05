import * as THREE from "three";
import type { Decoration } from "../types";
import { addBox, flatMaterial } from "../common";
import { outlinedMaterial } from "../../rendering/cel-shading";

/** Reusable directional board; local +Z faces approaching drivers. */
export function createCurveMarker(direction: -1 | 1): Decoration {
  const group = new THREE.Group();
  group.name = "curve-chevron";
  const frame = outlinedMaterial(0x20594f, 0.001);
  const cream = flatMaterial(0xffedc3);
  cream.side = THREE.DoubleSide;
  addBox(group, 0.18, 2.2, 0.18, frame, 0, 1.1, 0);
  addBox(group, 2.8, 1.15, 0.18, frame, 0, 2.1, 0);
  addBox(group, 2.8, 0.08, 0.2, cream, 0, 2.66, 0);
  const arrow = new THREE.Shape();
  arrow.moveTo(-0.33, -0.34); arrow.lineTo(-0.08, -0.34);
  arrow.lineTo(0.35, 0); arrow.lineTo(-0.08, 0.34);
  arrow.lineTo(-0.33, 0.34); arrow.lineTo(0.1, 0); arrow.closePath();
  for (const x of [-0.8, 0, 0.8]) {
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(arrow), cream);
    mesh.position.set(x, 2.1, 0.101);
    mesh.scale.x = direction;
    group.add(mesh);
  }
  return { group, colliders: [
    { center: { x: 0, y: 1.1, z: 0 }, half: { x: 0.12, y: 1.1, z: 0.12 }, yaw: 0 },
  ] };
}
