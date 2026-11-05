import * as THREE from "three";

export interface Placement {
  x: number;
  y: number;
  z: number;
  scale?: number;
  yaw?: number;
}

/** Deterministic generator used by the legacy trackside decoration. */
export function pseudoRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Deterministic generator used by the tropical scenery layout. */
export function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createBatch(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: readonly Placement[],
  shadows = false,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    geometry,
    material,
    Math.max(1, placements.length),
  );
  const dummy = new THREE.Object3D();
  placements.forEach((spot, index) => {
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.rotation.set(0, spot.yaw ?? 0, 0);
    dummy.scale.setScalar(spot.scale ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.count = placements.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
}

export function batch(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: readonly Placement[],
  shadows = false,
): THREE.InstancedMesh {
  const mesh = createBatch(geometry, material, placements, shadows);
  parent.add(mesh);
  return mesh;
}

export function addBox(
  parent: THREE.Object3D,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  rotationY = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material,
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotationY;
  parent.add(mesh);
  return mesh;
}

export function makeInstances(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  return mesh;
}

export function flatMaterial(color: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color });
  material.userData.outlineParameters = { visible: false };
  return material;
}
