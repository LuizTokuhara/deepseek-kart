import * as THREE from "three";
import { outlinedMaterial } from "../../rendering/cel-shading";

/** Distant scenery stays beyond map bounds and never changes driving collisions. */
export function createBackdrop(width: number, depth: number, color: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "layered-landscape";
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const dummy = new THREE.Object3D();
  for (let layer = 0; layer < 2; layer++) {
    const material = outlinedMaterial(new THREE.Color(color).lerp(new THREE.Color(0x8cbdce), layer * 0.35).getHex(), layer === 0 ? 0.0008 : 0.0005);
    const mesh = new THREE.InstancedMesh(geometry, material, 22);
    for (let i = 0; i < 22; i++) {
      const angle = (i + layer * 0.6) / 22 * Math.PI * 2;
      const variation = (Math.sin(i * 7.3 + layer) + 1) / 2;
      dummy.position.set(Math.cos(angle) * (width / 2 + 56 + layer * 35), -4,
        Math.sin(angle) * (depth / 2 + 56 + layer * 35));
      dummy.scale.set(25 + variation * 13, 18 + variation * 24 + layer * 8, 25 + variation * 10);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
