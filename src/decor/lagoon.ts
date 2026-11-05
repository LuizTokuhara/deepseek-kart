import * as THREE from "three";
import { celMaterial } from "../cel-shading";
import type { ColliderBox } from "../types";
import { batch, flatMaterial, type Placement } from "./common";

export interface LagoonResult {
  group: THREE.Group;
  rippleMaterial: THREE.MeshBasicMaterial;
  colliders: ColliderBox[];
}

export function createLagoon(
  centerX = 94,
  centerZ = 20,
): LagoonResult {
  const group = new THREE.Group();
  group.name = "lagoon";
  group.position.set(centerX, 0, centerZ);

  const shore = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    celMaterial(0xe5ce91),
  );
  shore.rotation.x = -Math.PI / 2;
  shore.position.y = 0.012;
  shore.scale.set(19.4, 15.3, 1);
  shore.receiveShadow = true;
  group.add(shore);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    flatMaterial(0x399fae),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.023;
  water.scale.set(17.8, 13.7, 1);
  group.add(water);

  const colliders: ColliderBox[] = [];
  const stones: Placement[] = [];
  for (let index = 0; index < 44; index++) {
    const angle = index / 44 * Math.PI * 2;
    const x = Math.cos(angle) * 19.2;
    const z = Math.sin(angle) * 15.1;
    const scale = 1.15 + Math.sin(index * 5.3) * 0.25;
    stones.push({ x, y: 0.25, z, scale, yaw: angle });
    // The visible rocky shore also keeps karts out of the decorative water.
    colliders.push({
      center: { x: x + centerX, y: 0.5, z: z + centerZ },
      half: { x: 1.55 * scale, y: 0.5, z: 1.1 * scale },
      yaw: angle,
    });
  }

  const stoneGeometry = new THREE.DodecahedronGeometry(1, 0);
  stoneGeometry.scale(1.6, 0.7, 1.1);
  batch(group, stoneGeometry, celMaterial(0xa8a78d), stones, true);

  const rippleMaterial = flatMaterial(0x91e5dc);
  rippleMaterial.transparent = true;
  rippleMaterial.opacity = 0.4;
  rippleMaterial.depthWrite = false;
  const ripples: Placement[] = [];
  for (let index = 0; index < 26; index++) {
    const angle = index * 2.4;
    const radius = Math.sqrt(index / 26) * 10;
    ripples.push({
      x: Math.cos(angle) * radius * 1.4,
      y: 0.035,
      z: Math.sin(angle) * radius,
      scale: 0.7 + (index % 3) * 0.5,
    });
  }
  batch(
    group,
    new THREE.BoxGeometry(1.8, 0.008, 0.08),
    rippleMaterial,
    ripples,
  );

  return { group, rippleMaterial, colliders };
}
