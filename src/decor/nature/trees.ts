import * as THREE from "three";
import { celMaterial } from "../../rendering/cel-shading";
import { makeInstances } from "../common";

export interface TreeSpot {
  x: number;
  z: number;
  scale: number;
  rotation: number;
  foliage: "a" | "b";
}

/** Batches trunks and two foliage variants; placement stays track-specific. */
export function buildTrees(
  spots: readonly TreeSpot[],
  parent: THREE.Group,
): void {
  const trunkGeometry = new THREE.CylinderGeometry(0.22, 0.32, 2.4, 5);
  const trunkMaterial = celMaterial(0x7a5230);
  const trunkMesh = makeInstances(
    trunkGeometry,
    trunkMaterial,
    Math.max(1, spots.length),
  );
  const foliageAGeometry = new THREE.IcosahedronGeometry(1, 0);
  const foliageBGeometry = new THREE.IcosahedronGeometry(1, 0);
  const foliageAMaterial = celMaterial(0x4f8f3a);
  const foliageBMaterial = celMaterial(0x6aa84f);
  const foliageA: TreeSpot[] = [];
  const foliageB: TreeSpot[] = [];

  for (const tree of spots) {
    (tree.foliage === "a" ? foliageA : foliageB).push(tree);
  }

  const dummy = new THREE.Object3D();
  for (let index = 0; index < spots.length; index++) {
    const tree = spots[index];
    dummy.position.set(tree.x, 1.2, tree.z);
    dummy.scale.setScalar(tree.scale);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(index, dummy.matrix);
  }
  trunkMesh.count = spots.length;
  trunkMesh.instanceMatrix.needsUpdate = true;
  trunkMesh.castShadow = true;
  parent.add(trunkMesh);

  const addFoliage = (
    trees: TreeSpot[],
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
  ): void => {
    if (trees.length === 0) {
      return;
    }
    const mesh = makeInstances(geometry, material, trees.length);
    for (let index = 0; index < trees.length; index++) {
      const tree = trees[index];
      dummy.position.set(tree.x, 2.9 + tree.scale * 0.25, tree.z);
      dummy.scale.set(1.8 * tree.scale, 1.4 * tree.scale, 1.8 * tree.scale);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    parent.add(mesh);
  };

  addFoliage(foliageA, foliageAGeometry, foliageAMaterial);
  addFoliage(foliageB, foliageBGeometry, foliageBMaterial);
}
