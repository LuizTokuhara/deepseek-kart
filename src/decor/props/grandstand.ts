import * as THREE from "three";
import { outlinedMaterial } from "../../rendering/cel-shading";
import type { ColliderBox } from "../../core/types";
import { addBox, makeInstances, pseudoRandom } from "../common";

export const DEFAULT_GRANDSTAND_LENGTH = 56;

interface CrowdSpot {
  x: number;
  y: number;
  z: number;
  scale: number;
  color: number;
}

export interface GrandstandOptions {
  centerX: number;
  centerZ: number;
  rotationY: number;
  seed: number;
  boardMaterial: THREE.Material;
  length?: number;
  structureColor?: number;
  roofColor?: number;
  seatColors?: readonly [number, number];
}

export interface GrandstandResult {
  group: THREE.Group;
  collider: ColliderBox;
}

export function createGrandstand(
  options: GrandstandOptions,
): GrandstandResult {
  const {
    centerX,
    centerZ,
    rotationY,
    seed,
    boardMaterial,
    length = DEFAULT_GRANDSTAND_LENGTH,
  } = options;
  const group = new THREE.Group();
  group.position.set(centerX, 0, centerZ);
  group.rotation.y = rotationY;

  const structure = outlinedMaterial(options.structureColor ?? 0xdbe3e8);
  const roofMaterial = outlinedMaterial(options.roofColor ?? 0x235c59);
  const seatBlue = outlinedMaterial(options.seatColors?.[0] ?? 0x3c7fa3);
  const seatWhite = outlinedMaterial(options.seatColors?.[1] ?? 0xf1f0e5);
  const dark = outlinedMaterial(0x172333);

  addBox(group, length + 1.6, 0.45, 7.4, structure, 0, 0.225, -3.2);
  addBox(group, length, 5.4, 0.35, structure, 0, 2.7, -6.05);

  for (let tier = 0; tier < 5; tier++) {
    const tierY = 0.45 + tier * 0.44;
    const tierZ = -0.55 - tier * 0.9;
    addBox(
      group,
      length,
      0.38,
      1.02,
      tier % 2 === 0 ? seatBlue : seatWhite,
      0,
      tierY + 0.19,
      tierZ,
    );
    addBox(
      group,
      length,
      0.38,
      0.09,
      structure,
      0,
      tierY + 0.54,
      tierZ - 0.46,
    );
  }

  const roof = addBox(
    group,
    length + 2,
    0.26,
    7.9,
    roofMaterial,
    0,
    6.25,
    -2.7,
  );
  roof.castShadow = true;
  for (const side of [-1, 1]) {
    addBox(
      group,
      0.24,
      6.1,
      0.24,
      structure,
      side * (length / 2 - 1),
      3,
      -5.5,
    );
  }
  addBox(
    group,
    length + 2,
    0.8,
    0.2,
    roofMaterial,
    0,
    5.85,
    0.05,
  );

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 1.2),
    boardMaterial,
  );
  sign.position.set(0, 5.5, 0.17);
  group.add(sign);

  const spots: CrowdSpot[] = [];
  const random = pseudoRandom(seed);
  const colors = [
    0xef4444, 0xf59e0b, 0x3b82f6, 0x22c55e, 0xec4899, 0xf8fafc, 0x8b5cf6,
  ];

  for (let tier = 0; tier < 5; tier++) {
    const y = 0.45 + tier * 0.44 + 0.64;
    const z = -0.55 - tier * 0.9 + 0.14;

    for (
      let x = -length / 2 + 1.2;
      x <= length / 2 - 1.2;
      x += 0.82
    ) {
      if (random() < 0.16) {
        continue;
      }
      spots.push({
        x: x + (random() - 0.5) * 0.12,
        y,
        z: z + (random() - 0.5) * 0.12,
        scale: 0.85 + random() * 0.28,
        color: colors[Math.floor(random() * colors.length)],
      });
    }
  }

  const crowd = makeInstances(
    new THREE.BoxGeometry(0.32, 0.52, 0.3),
    (() => {
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
      material.userData.outlineParameters = { visible: false };
      return material;
    })(),
    spots.length,
  );
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let index = 0; index < spots.length; index++) {
    const spot = spots[index];
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.scale.setScalar(spot.scale);
    dummy.updateMatrix();
    crowd.setMatrixAt(index, dummy.matrix);
    crowd.setColorAt(index, color.setHex(spot.color));
  }

  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) {
    crowd.instanceColor.needsUpdate = true;
  }
  group.add(crowd);

  return {
    group,
    collider: {
      center: {
        x: centerX,
        y: 2.5,
        z: centerZ - 3.1 * Math.cos(rotationY),
      },
      half: { x: length / 2, y: 2.5, z: 3.6 },
      yaw: rotationY,
    },
  };
}
