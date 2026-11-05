import * as THREE from "three";
import { outlinedMaterial } from "../../rendering/cel-shading";

/** Reusable low-poly hot-air balloon; position it from the course layout. */
export function createBalloon(): THREE.Group {
  const balloon = new THREE.Group();

  const envelopeMaterial = outlinedMaterial(0xf7f4e8, 0.0015);
  const greenMaterial = outlinedMaterial(0x2aa78f, 0.0015);
  const basketMaterial = outlinedMaterial(0x8a5a36, 0.0015);
  const ropeMaterial = outlinedMaterial(0x172333, 0.001);

  const envelope = new THREE.Mesh(
    new THREE.SphereGeometry(5, 16, 12),
    envelopeMaterial,
  );
  envelope.scale.set(1, 1.25, 1);
  balloon.add(envelope);

  const band = new THREE.Mesh(
    new THREE.TorusGeometry(5, 0.32, 8, 28),
    greenMaterial,
  );
  band.rotation.x = Math.PI / 2;
  balloon.add(band);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.4, 0.9, 10),
    greenMaterial,
  );
  collar.position.y = -5.6;
  balloon.add(collar);

  const basket = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1, 1.8),
    basketMaterial,
  );
  basket.position.y = -7.5;
  balloon.add(basket);

  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const rope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 2.2, 4),
        ropeMaterial,
      );
      rope.position.set(x * 0.75, -6.5, z * 0.75);
      rope.rotation.z = x * 0.23;
      rope.rotation.x = z * 0.23;
      balloon.add(rope);
    }
  }

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 2.5, 4),
    ropeMaterial,
  );
  pole.position.y = 7;
  balloon.add(pole);
  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.6, 0.05),
    greenMaterial,
  );
  flag.position.set(0.45, 8.1, 0);
  balloon.add(flag);

  return balloon;
}
