import * as THREE from "three";

export interface BoostFlame {
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
}

export function createBoostFlame(): BoostFlame {
  const material = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const flame = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.16, 0.7),
      material,
    );
    flame.position.set(side * 0.46, 1.04, -1.5);
    flame.rotation.set(0.34, side * -0.14, 0);
    group.add(flame);
  }

  group.visible = false;
  return { group, material };
}
