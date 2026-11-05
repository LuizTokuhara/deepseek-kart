import * as THREE from "three";
import { celMaterial } from "../../rendering/cel-shading";

export interface HillSpot {
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

export function buildHills(
  spots: readonly HillSpot[],
  parent: THREE.Group,
  color = 0x6f9052,
): void {
  const material = celMaterial(color);

  for (const hill of spots) {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      material,
    );
    mesh.position.set(hill.x, 0, hill.z);
    mesh.scale.set(hill.sx, hill.sy, hill.sz);
    parent.add(mesh);
  }
}
