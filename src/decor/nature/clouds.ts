import * as THREE from "three";
import { celMaterial } from "../../rendering/cel-shading";
import { makeInstances } from "../common";

export interface CloudSpot {
  x: number;
  y: number;
  z: number;
  scale: number;
}

export function buildClouds(
  spots: readonly CloudSpot[],
  parent: THREE.Group,
): void {
  const cloudMaterial = celMaterial(0xf8f8ee);
  cloudMaterial.emissive.setHex(0xc4dbe9);
  cloudMaterial.emissiveIntensity = 0.4;
  const mesh = makeInstances(
    new THREE.IcosahedronGeometry(1, 1),
    cloudMaterial,
    Math.max(1, spots.length),
  );
  const dummy = new THREE.Object3D();
  for (let index = 0; index < spots.length; index++) {
    const spot = spots[index];
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.scale.set(spot.scale * 1.5, spot.scale * 0.95, spot.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.count = spots.length;
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
}
