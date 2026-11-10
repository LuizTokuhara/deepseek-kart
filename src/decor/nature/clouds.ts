import * as THREE from "three";
import { celMaterial } from "../../rendering/cel-shading";
import { VISUAL_QUALITY, type VisualQuality } from "../../core/visual-quality";
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
  quality: VisualQuality = VISUAL_QUALITY,
): void {
  const cloudMaterial = celMaterial(0xf8f8ee);
  cloudMaterial.emissive.setHex(0xc4dbe9);
  cloudMaterial.emissiveIntensity = 0.4;
  const count = Math.max(
    0,
    Math.min(spots.length, Math.round(spots.length * quality.cloudDensity)),
  );
  const mesh = makeInstances(
    new THREE.IcosahedronGeometry(1, 1),
    cloudMaterial,
    Math.max(1, count),
  );
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index++) {
    const spot = spots[index];
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.scale.set(spot.scale * 1.5, spot.scale * 0.95, spot.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
}
