import * as THREE from "three";
import { paintedWater } from "../../rendering/painted-water";
import { celMaterial, outlinedMaterial } from "../../rendering/cel-shading";
import type { ColliderBox } from "../../core/types";
import { batch, flatMaterial, type Placement } from "../common";
import type { Decoration } from "../types";

export interface LagoonResult extends Decoration {
  rippleMaterial: THREE.MeshBasicMaterial;
  colliders: ColliderBox[];
  update(dt: number): void;
}

export function createLagoon(
  centerX = 0,
  centerZ = 0,
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

  const wetSand = new THREE.Mesh(new THREE.CircleGeometry(1, 64), celMaterial(0xc9c698));
  wetSand.rotation.x = -Math.PI / 2;
  wetSand.position.y = 0.021; wetSand.scale.set(18.6, 14.5, 1);
  group.add(wetSand);
  const waterMaterial = paintedWater();
  const waterGeometry = new THREE.CircleGeometry(1, 64);
  const waterPositions = waterGeometry.getAttribute("position");
  for (let i = 1; i < waterPositions.count; i++) {
    const x = waterPositions.getX(i), y = waterPositions.getY(i), a = Math.atan2(y, x);
    const radius = 1 + Math.sin(a * 3) * 0.018 + Math.cos(a * 5) * 0.012;
    waterPositions.setXY(i, x * radius, y * radius);
  }
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.033;
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

  // Low stones on the track-facing bank reveal the water from the chase camera.
  for (const near of [true, false]) {
    const stoneGeometry = new THREE.DodecahedronGeometry(1, 0);
    stoneGeometry.scale(1.6, near ? 0.32 : 0.85, 1.1);
    const bank = stones.filter(spot => (spot.x < 0) === near)
      .map(spot => ({ ...spot, y: near ? 0.12 : 0.3 }));
    batch(group, stoneGeometry, outlinedMaterial(near ? 0xb9ba9e : 0x899b91), bank, true);
  }

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
      y: 0.047,
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

  let elapsed = 0;
  return {
    group,
    rippleMaterial,
    colliders,
    update(dt) {
      elapsed += dt;
      waterMaterial.uniforms.time.value = elapsed;
      rippleMaterial.opacity = 0.15 + Math.sin(elapsed * 1.1) * 0.06;
    },
  };
}
