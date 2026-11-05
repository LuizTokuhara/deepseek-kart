import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Bake static props into one mesh per material, retaining animated cloth. */
export function mergeStaticDecoration(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const sources: THREE.Mesh[] = [];
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh ||
        Array.isArray(object.material) || object.userData.animated) return;
    const geometry = object.geometry.index
      ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    const batch = batches.get(object.material) ?? [];
    batch.push(geometry);
    batches.set(object.material, batch);
    sources.push(object);
  });
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts);
    if (!geometry) throw new Error("Incompatible static decoration geometry");
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    parts.forEach(part => part.dispose());
  }
  sources.forEach(mesh => mesh.removeFromParent());
  // These builders own their source geometry; shared materials remain reusable.
  new Set(sources.map(mesh => mesh.geometry)).forEach(geometry => geometry.dispose());
}
