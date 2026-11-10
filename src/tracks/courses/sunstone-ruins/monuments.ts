import * as THREE from "three";
import { mergeStaticDecoration } from "../../../decor/merge-static";
import { columnDrumGeometry, weatheredBlockGeometry } from "../../../decor/props/stone-shapes";
import { celMaterial, outlinedMaterial } from "../../../rendering/cel-shading";
import { pyramidCoreGeometry, pyramidMasonryGeometry } from "./pyramid-masonry";

export interface PyramidPlacement {
  x: number;
  z: number;
  base: number;
  height: number;
  steps?: number;
  rotation?: number;
  door?: boolean;
}

const LIGHT_SANDSTONE = 0xddb06b;
const DARK_SANDSTONE = 0xa8783e;

function addMesh(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** Sloped stone courses, chipped joints, a recessed portal and a gilded apex. */
export function createPyramid(spot: PyramidPlacement): THREE.Group {
  const group = new THREE.Group();
  group.name = "sunstone-pyramid";
  const details = new THREE.Group();
  details.name = "pyramid-portal-and-cap";
  const dark = outlinedMaterial(DARK_SANDSTONE, 0.0005);
  const gold = outlinedMaterial(0xe7c475, 0.0005);
  const frame = outlinedMaterial(LIGHT_SANDSTONE, 0.0005);
  const teal = outlinedMaterial(0x286e71, 0.0004);
  const shade = outlinedMaterial(0x241a12, 0.0003);
  const capHeight = Math.min(2.6, spot.height * 0.13);
  const door = spot.door === false ? undefined : {
    width: Math.min(spot.base * 0.14, 6), height: Math.min(spot.height * 0.22, 7.5),
  };
  const seed = Math.abs(Math.round(spot.x * 31 + spot.z * 17));
  const core = addMesh(group, pyramidCoreGeometry(spot.base, spot.height, door),
    outlinedMaterial(0xb38c55, 0.0005), 0, 0, 0);
  core.name = "pyramid-inner-masonry";
  const stone = celMaterial(0xffffff);
  stone.vertexColors = true;
  const casing = addMesh(group, pyramidMasonryGeometry({
    base: spot.base, height: spot.height, capHeight,
    rows: Math.max(4, Math.round(spot.steps ?? spot.height / 1.8)), seed, door,
  }), stone, 0, 0, 0);
  casing.name = "pyramid-sloped-masonry";
  addMesh(details, weatheredBlockGeometry(spot.base + 0.5, 0.4, spot.base + 0.5, seed), dark, 0, 0.1, 0);
  addMesh(details, weatheredBlockGeometry(spot.base - 0.1, 0.32, spot.base - 0.1, seed + 1), frame, 0, 0.37, 0);
  const cap = new THREE.ConeGeometry(spot.base / Math.SQRT2 * capHeight / spot.height * 1.02,
    capHeight, 4).toNonIndexed();
  cap.rotateY(Math.PI / 4);
  cap.computeVertexNormals();
  addMesh(details, cap, gold, 0, spot.height - capHeight / 2 + 0.02, 0);

  if (door) {
    const front = spot.base / 2 + 0.35;
    const depth = door.height * spot.base / (2 * spot.height) + 1;
    const back = spot.base / 2 - depth;
    // The front face is cut out; these surfaces form the actual shadowed recess.
    const portal = addMesh(details, new THREE.BoxGeometry(door.width + 0.1, door.height, 0.12),
      shade, 0, door.height / 2, back);
    portal.name = "pyramid-door";
    const jambDepth = front - back;
    for (const side of [-1, 1]) {
      for (let course = 0; course < 3; course++) {
        const h = door.height / 3;
        addMesh(details, weatheredBlockGeometry(0.9, h - 0.035, jambDepth, seed + course),
          frame, side * (door.width / 2 + 0.45), (course + 0.5) * h,
          (front + back) / 2);
      }
      addMesh(details, new THREE.BoxGeometry(0.12, door.height - 0.1, 0.08), gold,
        side * (door.width / 2 + 0.17), door.height / 2, front + 0.025);
    }
    addMesh(details, weatheredBlockGeometry(door.width + 2.2, 0.85, jambDepth + 0.2, seed + 4),
      frame, 0, door.height + 0.42, (front + back) / 2);
    addMesh(details, new THREE.BoxGeometry(door.width + 2.3, 0.18, 0.12), teal,
      0, door.height + 0.6, front + 0.1);
    addMesh(details, weatheredBlockGeometry(door.width + 2.3, 0.22, jambDepth + 0.3, seed + 5),
      frame, 0, 0.53, (front + back) / 2);
    addMesh(details, new THREE.BoxGeometry(door.width - 0.05, 0.02, jambDepth - 0.35),
      shade, 0, 0.66, (front + back) / 2 - 0.18);

    // The solar relief sits on the sloping masonry instead of floating over the gate.
    const radius = Math.min(1, door.width * 0.2);
    const y = door.height + 1.7;
    const z = spot.base / 2 * (1 - y / spot.height);
    const normal = new THREE.Vector3(0, spot.base / (2 * spot.height), 1).normalize();
    const sun = addMesh(details, new THREE.CylinderGeometry(radius, radius, 0.18, 16),
      gold, 0, y, z + 0.08);
    sun.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const halo = addMesh(details, new THREE.TorusGeometry(radius * 1.25, radius * 0.1, 4, 20),
      teal, 0, y, z + 0.08);
    halo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  }
  mergeStaticDecoration(details);
  group.add(details);
  group.position.set(spot.x, 0, spot.z);
  group.rotation.y = spot.rotation ?? 0;
  return group;
}

export interface SphinxPlacement {
  x: number;
  z: number;
  scale?: number;
  rotation?: number;
}

/** Stylized sphinx: lion body, striped nemes, and a disc on the forehead. */
export function createSphinx(spot: SphinxPlacement): THREE.Group {
  const group = new THREE.Group();
  const scale = spot.scale ?? 1;
  const sandstone = outlinedMaterial(0xcfa163, 0.001);
  const light = outlinedMaterial(0xdfb877, 0.001);
  const dark = outlinedMaterial(0x8c6438, 0.001);
  const gold = outlinedMaterial(0xe7c46a, 0.001);
  const teal = outlinedMaterial(0x2a7b7b, 0.001);
  const black = outlinedMaterial(0x1c1712, 0.001);

  addMesh(group, new THREE.BoxGeometry(16, 1.2, 10), dark, 0, 0.6, 0);
  addMesh(group, new THREE.BoxGeometry(8.2, 2.5, 5), sandstone, 0, 2.3, -0.8);
  for (const side of [-1, 1]) {
    addMesh(
      group,
      new THREE.BoxGeometry(2.3, 1.7, 3.4),
      sandstone,
      side * 2.9,
      1.9,
      -3.1,
    );
    addMesh(
      group,
      new THREE.BoxGeometry(1.5, 1.5, 6.1),
      light,
      side * 2.15,
      1.45,
      2.8,
    );
    addMesh(
      group,
      new THREE.BoxGeometry(1.8, 0.8, 2.1),
      light,
      side * 2.15,
      0.9,
      5.85,
    );
  }
  addMesh(group, new THREE.BoxGeometry(4.6, 3.4, 3.2), light, 0, 3.5, 1.7);

  const head = addMesh(
    group,
    new THREE.BoxGeometry(2.7, 2.7, 2.5),
    sandstone,
    0,
    5.35,
    2.35,
  );
  head.name = "sphinx-head";
  // Flatter, wider face, with eyes, nose, and mouth readable from a distance.
  addMesh(group, new THREE.BoxGeometry(2.15, 2.05, 0.46), light, 0, 5.35, 3.58);
  addMesh(group, new THREE.BoxGeometry(1.55, 1.15, 1.15), light, 0, 5.05, 4.02);
  addMesh(group, new THREE.BoxGeometry(0.5, 0.42, 0.62), sandstone, 0, 5.35, 4.62);
  addMesh(group, new THREE.BoxGeometry(0.92, 0.14, 0.16), black, 0, 4.8, 4.46);
  for (const side of [-1, 1]) {
    addMesh(group, new THREE.BoxGeometry(0.62, 0.22, 0.12), black, side * 0.58, 5.72, 3.86);
    addMesh(group, new THREE.BoxGeometry(0.2, 0.12, 0.08), gold, side * 0.58, 5.73, 3.94);
    addMesh(group, new THREE.BoxGeometry(0.45, 0.8, 0.4), sandstone, side * 1.58, 5.95, 2.5);
  }

  // Nemes: lowered hood, side flaps, and turquoise/gold stripes.
  addMesh(group, new THREE.BoxGeometry(3.7, 0.95, 3.3), gold, 0, 6.6, 1.7);
  addMesh(group, new THREE.BoxGeometry(3.2, 2.4, 1.3), gold, 0, 5.45, 1.15);
  for (const side of [-1, 1]) {
    const flap = addMesh(
      group,
      new THREE.BoxGeometry(1.05, 3.5, 2.65),
      gold,
      side * 1.95,
      4.45,
      2.05,
    );
    flap.rotation.z = side * -0.14;
    for (let stripe = 0; stripe < 3; stripe++) {
      const band = addMesh(
        group,
        new THREE.BoxGeometry(1.11, 0.32, 2.69),
        teal,
        side * 1.96,
        3.4 + stripe * 0.86,
        2.05,
      );
      band.rotation.z = side * -0.14;
    }
    const lappet = addMesh(
      group,
      new THREE.BoxGeometry(0.44, 2.2, 1.5),
      gold,
      side * 1.12,
      3.9,
      3.15,
    );
    lappet.rotation.z = side * -0.08;
  }
  addMesh(group, new THREE.BoxGeometry(0.4, 1.05, 0.4), gold, 0, 3.65, 4.02);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 14), gold);
  disc.rotation.x = Math.PI / 2;
  disc.position.set(0, 6.72, 3.2);
  group.add(disc);
  const cobra = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 5), teal);
  cobra.position.set(0, 7.1, 3.2);
  group.add(cobra);

  group.position.set(spot.x, 0, spot.z);
  group.rotation.y = spot.rotation ?? 0;
  group.scale.setScalar(scale);
  return group;
}

export interface ObeliskPlacement {
  x: number;
  z: number;
  height?: number;
  rotation?: number;
}

/** Square obelisk with bands, glyphs, and a golden pyramid on top. */
export function createObelisk(spot: ObeliskPlacement): THREE.Group {
  const group = new THREE.Group();
  const height = spot.height ?? 11;
  const stone = outlinedMaterial(0xc79550, 0.0009);
  const gold = outlinedMaterial(0xefcd73, 0.0008);
  const teal = outlinedMaterial(0x267676, 0.0008);

  addMesh(group, new THREE.BoxGeometry(3, 1, 3), stone, 0, 0.5, 0);
  addMesh(group, new THREE.BoxGeometry(2.35, 0.4, 2.35), gold, 0, 1.15, 0);
  const shaft = addMesh(
    group,
    new THREE.CylinderGeometry(0.52, 0.86, height, 4),
    stone,
    0,
    1.35 + height / 2,
    0,
  );
  shaft.rotation.y = Math.PI / 4;
  for (const [y, color] of [
    [2.2, teal],
    [height * 0.55, gold],
    [height * 0.9, teal],
  ] as const) {
    const band = addMesh(
      group,
      new THREE.CylinderGeometry(0.63, 0.72, 0.22, 4),
      color,
      0,
      1.35 + y,
      0,
    );
    band.rotation.y = Math.PI / 4;
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.67, 1.5, 4), gold);
  tip.position.y = 1.35 + height + 0.75;
  tip.rotation.y = Math.PI / 4;
  tip.castShadow = true;
  group.add(tip);

  // Glyphs cut into the four faces.
  for (let face = 0; face < 4; face++) {
    for (let row = 0; row < 4; row++) {
      const glyph = addMesh(
        group,
        new THREE.BoxGeometry(0.14, 0.28, 0.1),
        row % 2 === 0 ? gold : teal,
        Math.sin(face * Math.PI / 2) * 0.73,
        4.2 + row * 1.35,
        Math.cos(face * Math.PI / 2) * 0.73,
      );
      glyph.rotation.y = face * Math.PI / 2;
    }
  }

  group.position.set(spot.x, 0, spot.z);
  group.rotation.y = spot.rotation ?? 0;
  return group;
}

export interface RuinColumnPlacement {
  x: number;
  z: number;
  height?: number;
  rotation?: number;
  fallen?: boolean;
}

/** Jointed, chipped sandstone columns; fallen drums separate along the fracture. */
export function createRuinColumn(spot: RuinColumnPlacement): THREE.Group {
  const group = new THREE.Group();
  group.name = spot.fallen ? "fallen-ruin-column" : "ruin-column";
  const stone = outlinedMaterial(0xc79a5b, 0.0009);
  const dark = outlinedMaterial(0x9c723f, 0.0009);
  const height = spot.height ?? 4.5;
  const seed = Math.abs(Math.floor(spot.x * 31 + spot.z * 17));
  const block = (w: number, h: number, d: number, x: number, y: number, material = stone) =>
    addMesh(group, weatheredBlockGeometry(w, h, d, seed + Math.round(y * 7)), material, x, y, 0);

  if (spot.fallen) {
    for (let index = 0; index < 3; index++) {
      const length = height * 0.3;
      const drum = addMesh(group, columnDrumGeometry(0.78, 0.7, length, seed + index, true),
        stone, (index - 1) * height * 0.33, 0.7 - index * 0.035, index === 1 ? 0.12 : 0);
      drum.rotation.set(0.03 * index, 0, Math.PI / 2 + (index - 1) * 0.06);
    }
    block(0.5, 1.45, 1.6, -height / 2, 0.73, dark);
    block(0.5, 1.35, 1.6, height / 2, 0.68, dark);
  } else {
    block(2.2, 0.55, 2.2, 0, 0.28, dark);
    block(1.65, 0.32, 1.65, 0, 0.7);
    const drums = Math.max(3, Math.round(height / 1.1));
    for (let index = 0; index < drums; index++) {
      const bottom = 0.72 - index / drums * 0.12;
      const top = 0.72 - (index + 1) / drums * 0.12;
      const drumHeight = height / drums;
      const shaft = addMesh(group, columnDrumGeometry(bottom, top, drumHeight - 0.035,
        seed + index, index === drums - 1), stone,
        index % 2 ? 0.025 : 0, 0.86 + (index + 0.5) * drumHeight, 0);
      shaft.rotation.y = Math.PI / 8 + (index % 2) * 0.035;
    }
    if (seed % 3 !== 1) {
      block(1.75, 0.45, 1.75, 0, height + 1.08);
      block(1.95, 0.22, 1.95, 0, height + 1.42, dark);
      const fragment = block(0.64, 0.27, 0.52, 0.25, height + 1.65);
      fragment.rotation.y = 0.25;
    } else {
      // A missing capital exposes the fractured upper drum.
      const fragment = block(0.65, 0.3, 0.52, 0.45, 0.17);
      fragment.position.z = 0.52;
      fragment.rotation.y = 0.4;
    }
  }
  mergeStaticDecoration(group);
  group.position.set(spot.x, 0, spot.z);
  group.rotation.y = spot.rotation ?? 0;
  return group;
}
