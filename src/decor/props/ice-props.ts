import * as THREE from "three";
import { BLOB_SHADOW_FLAG } from "../../rendering/blob-shadows";
import { celMaterial, outlinedMaterial } from "../../rendering/cel-shading";
import { addBox, makeInstances, type Placement } from "../common";

export interface SnowmanSpot {
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

export interface IceBlockSpot {
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

export interface IceCrystalSpot {
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

const snow = celMaterial(0xf7fcff);
const snowShadow = celMaterial(0xdceff8);
const coal = celMaterial(0x172033);
const carrot = celMaterial(0xf28b2b);
const stick = celMaterial(0x6d4a34);
const scarf = celMaterial(0x3f8fbe);
const iceMaterial = new THREE.MeshToonMaterial({
  color: 0xbfeafa,
  transparent: true,
  opacity: 0.82,
});
iceMaterial.userData.outlineParameters = {
  visible: true,
  color: new THREE.Color(0x2b6d8d).toArray(),
  thickness: 0.0026,
};

/** Original snowman, built from spheres and simple details. */
export function buildSnowmen(
  spots: readonly SnowmanSpot[],
  parent: THREE.Group,
): void {
  for (const spot of spots) {
    const group = new THREE.Group();
    group.name = "snowman";
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = spot.rotation;
    group.scale.setScalar(spot.scale);
    parent.add(group);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.78, 12, 9), snow);
    body.position.y = 0.72;
    body.scale.y = 0.92;
    body.castShadow = true;
    group.add(body);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 9), snow);
    torso.position.y = 1.62;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.43, 12, 9), snow);
    head.position.y = 2.36;
    head.castShadow = true;
    group.add(head);

    const eyeGeometry = new THREE.SphereGeometry(0.055, 7, 5);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, coal);
      eye.position.set(side * 0.15, 2.47, 0.37);
      group.add(eye);
      const button = new THREE.Mesh(eyeGeometry, coal);
      button.position.set(0, 1.6 + side * 0.18, 0.56);
      group.add(button);
    }

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.38, 7), carrot);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 2.34, 0.55);
    group.add(nose);

    const scarfRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.09, 6, 12),
      scarf,
    );
    scarfRing.rotation.x = Math.PI / 2;
    scarfRing.position.y = 2.03;
    group.add(scarfRing);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.2, 5), stick);
      arm.position.set(side * 0.75, 1.75, 0);
      arm.rotation.z = side * 1.05;
      group.add(arm);
    }

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 16),
      new THREE.MeshBasicMaterial({ color: 0x8fb9ca, transparent: true, opacity: 0.28 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);
  }
}

/** Stacked ice blocks, inspired by the breakable ice obstacles. */
export function buildIceBlocks(
  spots: readonly IceBlockSpot[],
  parent: THREE.Group,
): void {
  const placements: Placement[] = [];
  for (const spot of spots) {
    const layers = spot.scale > 1.15 ? 3 : 2;
    for (let layer = 0; layer < layers; layer++) {
      const count = layer === 2 ? 1 : 2;
      for (let index = 0; index < count; index++) {
        const offset = (index - (count - 1) / 2) * 0.9 * spot.scale;
        placements.push({
          x: spot.x + Math.cos(spot.rotation) * offset,
          y: 0.45 * spot.scale + layer * 0.9 * spot.scale,
          z: spot.z - Math.sin(spot.rotation) * offset,
          yaw: spot.rotation + (layer + index) * 0.09,
          scale: 0.9 * spot.scale,
        });
      }
    }
  }
  const mesh = makeInstances(
    new THREE.BoxGeometry(1, 1, 1),
    iceMaterial,
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
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData[BLOB_SHADOW_FLAG] = true;
  parent.add(mesh);
}

/** Fan-shaped ice crystals, used as landmarks and background decoration. */
export function buildIceCrystals(
  spots: readonly IceCrystalSpot[],
  parent: THREE.Group,
): void {
  const material = outlinedMaterial(0x9edcf2, 0.0014);
  for (const spot of spots) {
    const group = new THREE.Group();
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = spot.rotation;
    group.scale.setScalar(spot.scale);
    parent.add(group);
    for (let index = 0; index < 5; index++) {
      const angle = (index / 5) * Math.PI * 2;
      const crystal = new THREE.Mesh(
        new THREE.ConeGeometry(0.22 + (index % 3) * 0.08, 1.5 + (index % 2) * 0.7, 5),
        material,
      );
      crystal.position.set(Math.cos(angle) * 0.35, 0.75, Math.sin(angle) * 0.35);
      crystal.rotation.set(
        Math.cos(angle) * 0.25,
        angle,
        Math.sin(angle) * 0.25,
      );
      group.add(crystal);
    }
    const iceBase = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.55, 0),
      celMaterial(0xd4f2fb),
    );
    iceBase.position.y = 0.22;
    iceBase.scale.y = 0.55;
    group.add(iceBase);
  }
}

export interface FrozenPondOptions {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
}

/**
 * Decorative frozen pond: dark water, snow rim and ice floes.
 * It takes no part in collision; it always stays in the infield or outside
 * the barriers.
 */
export function createFrozenPond(
  options: FrozenPondOptions,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "frozen-pond";
  group.position.set(options.x, 0, options.z);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshToonMaterial({ color: 0x2f7096 }),
  );
  water.material.userData.outlineParameters = { visible: false };
  water.rotation.x = -Math.PI / 2;
  water.scale.set(options.radiusX, options.radiusZ, 1);
  water.position.y = 0.012;
  group.add(water);

  const rim = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1.08, 48),
    snowShadow,
  );
  rim.rotation.x = -Math.PI / 2;
  rim.scale.set(options.radiusX, options.radiusZ, 1);
  rim.position.y = 0.024;
  group.add(rim);

  const floes = [
    [-0.44, -0.18, 0.33, 0.12],
    [0.28, 0.32, 0.24, -0.2],
    [0.05, -0.5, 0.18, 0.5],
    [0.52, -0.3, 0.14, 0.1],
    [-0.2, 0.46, 0.2, -0.4],
  ] as const;
  const floeMaterial = celMaterial(0xe8f8ff);
  for (const [fx, fz, scale, rotation] of floes) {
    const floe = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1, 0),
      floeMaterial,
    );
    floe.position.set(
      fx * options.radiusX,
      0.05,
      fz * options.radiusZ,
    );
    floe.rotation.y = rotation;
    floe.scale.set(scale * options.radiusX, 0.08, scale * options.radiusZ);
    group.add(floe);
  }

  return group;
}

/** Small snow drifts used to finish off the banks. */
export function buildSnowDrifts(
  spots: readonly { x: number; z: number; sx: number; sy: number; sz: number }[],
  parent: THREE.Group,
): void {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const mesh = makeInstances(geometry, snowShadow, Math.max(1, spots.length));
  const dummy = new THREE.Object3D();
  spots.forEach((spot, index) => {
    dummy.position.set(spot.x, 0.02, spot.z);
    dummy.scale.set(spot.sx, spot.sy, spot.sz);
    dummy.rotation.y = (index * 1.37) % (Math.PI * 2);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.count = spots.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

/** Trackside board with a dark frame, reusable in any scenery. */
export function createTracksideBoard(
  x: number,
  z: number,
  lookX: number,
  lookZ: number,
  faceMaterial: THREE.Material,
): THREE.Group {
  const board = new THREE.Group();
  board.position.set(x, 1.85, z);
  board.lookAt(lookX, 1.85, lookZ);

  const backing = celMaterial(0x1f4d66);
  addBox(board, 6.3, 1.25, 0.12, backing, 0, 0, 0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(6, 1), faceMaterial);
  face.position.set(0, 0, 0.075);
  board.add(face);
  for (const side of [-1, 1]) {
    addBox(board, 0.12, 0.9, 0.12, backing, side * 2.4, -0.85, 0);
  }
  return board;
}

/** Original ice penguin, with a collision volume defined by the course. */
export function createPenguin(): THREE.Group {
  const group = new THREE.Group();
  group.name = "penguin";
  const dark = celMaterial(0x244866);
  const white = celMaterial(0xf7fcff);
  const orange = celMaterial(0xf6b64b);
  const oval = (material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  oval(dark, 0, 0.62, 0, 0.43, 0.57, 0.36);
  oval(white, 0, 0.6, 0.27, 0.32, 0.43, 0.13);
  oval(dark, 0, 1.1, 0.03, 0.34, 0.32, 0.32);
  for (const side of [-1, 1]) {
    oval(white, side * 0.13, 1.15, 0.29, 0.1, 0.13, 0.055);
    oval(coal, side * 0.13, 1.16, 0.34, 0.04, 0.06, 0.025);
    oval(orange, side * 0.23, 0.08, 0.17, 0.19, 0.08, 0.3);
    const wing = oval(dark, side * 0.43, 0.69, 0, 0.09, 0.33, 0.19);
    wing.rotation.z = side * 0.28;
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 5), orange);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 1.02, 0.42);
  group.add(beak);
  return group;
}
