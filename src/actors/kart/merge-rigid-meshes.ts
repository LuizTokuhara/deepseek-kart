import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Batch a rigid assembly, leaving independently animated branches intact. */
export function mergeRigidMeshes(root: THREE.Group, excluded: readonly THREE.Object3D[] = []): void {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  const collect = (object: THREE.Object3D): void => {
    if (excluded.includes(object)) return;
    if (object instanceof THREE.Mesh && !(object instanceof THREE.InstancedMesh) && !Array.isArray(object.material)) {
      const batch = batches.get(object.material) ?? [];
      batch.push(object);
      batches.set(object.material, batch);
    }
    for (const child of object.children) collect(child);
  };
  collect(root);
  const released = new Set<THREE.BufferGeometry>();
  for (const [material, meshes] of batches) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(mesh => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      // Kart paint is procedural and uses no UVs; custom bodywork has none.
      geometry.deleteAttribute("uv");
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      return geometry;
    });
    const geometry = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    if (!geometry) throw new Error("Incompatible rigid kart geometry");
    const merged = new THREE.Mesh(geometry, material);
    merged.name = "rigid-batch";
    root.add(merged);
    for (const mesh of meshes) {
      mesh.removeFromParent();
      released.add(mesh.geometry);
    }
  }
  // This builder owns its input geometries; materials stay shared by all rigs.
  released.forEach(geometry => geometry.dispose());
}
