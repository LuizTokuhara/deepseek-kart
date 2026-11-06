import * as THREE from "three";
import { glowColor } from "../../rendering/glow";

export interface BoostFlame {
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
}

export function createBoostFlame(): BoostFlame {
  // HDR colors: the plume and its core feed the bloom pass.
  const material = new THREE.MeshBasicMaterial({
    color: glowColor(0x38bdf8),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  material.userData.outlineParameters = { visible: false };
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: glowColor(0xf2fcff), transparent: true, opacity: 0.95, depthWrite: false,
  });
  coreMaterial.userData.outlineParameters = { visible: false };

  // Faceted exhaust plume with a sharp tail and a pale inner flame.
  const geometry = new THREE.ConeGeometry(0.16, 1.35, 5, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -0.675);

  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const flame = new THREE.Mesh(
      geometry,
      material,
    );
    flame.position.set(side * 0.46, 1.04, -1.22);
    flame.rotation.set(0.12, side * -0.06, 0);
    const core = new THREE.Mesh(geometry, coreMaterial);
    core.scale.set(0.5, 0.5, 0.72);
    flame.add(core);
    group.add(flame);
  }

  group.visible = false;
  return { group, material };
}
