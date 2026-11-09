import * as THREE from "three";
import { outlinedMaterial } from "../../../rendering/cel-shading";

export interface PyramidPlacement {
  x: number;
  z: number;
  base: number;
  height: number;
  steps?: number;
  rotation?: number;
  door?: boolean;
}

const SANDSTONE = [0xd7a75f, 0xc8954c, 0xddb06b];
const DARK_SANDSTONE = 0xa8783e;

/** Sandstone blocks in grayscale; the color comes from the multiplied material. */
const masonry = (() => {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let seed = 0x51a7;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / 32);
      const shifted = (x + (row % 2) * 16) % size;
      const jointX = shifted % 32;
      const jointY = y % 32;
      const column = Math.floor(shifted / 32);
      let value = 226 + ((Math.imul(row + 5, 67) ^ Math.imul(column + 3, 131)) % 22) - 11;
      if (jointX < 2 || jointY < 2) value = 156 + random() * 14;
      else if (jointX < 4 || jointY < 4) value += 12;
      if (random() < 0.08) value -= 22;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.max(110, Math.min(255, value));
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
})();

function tierMaterial(color: number, size: number): ReturnType<typeof outlinedMaterial> {
  const material = outlinedMaterial(color, 0.0007);
  const map = masonry.clone();
  map.repeat.set(Math.max(1, Math.round(size / 6)), 1);
  map.needsUpdate = true;
  material.map = map;
  return material;
}

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

/** Square Egyptian silhouette with sloped masonry faces and a small gilded apex. */
export function createPyramid(spot: PyramidPlacement): THREE.Group {
  const group = new THREE.Group();
  group.name = "sunstone-pyramid";
  const dark = outlinedMaterial(DARK_SANDSTONE, 0.0005);
  const gold = outlinedMaterial(0xe7c475, 0.0005);
  const stone = tierMaterial(SANDSTONE[0], spot.base);
  stone.map!.repeat.set(spot.base / 2, spot.height / 8);
  const body = new THREE.CylinderGeometry(0, spot.base / Math.SQRT2, spot.height, 4, 1).toNonIndexed();
  body.rotateY(Math.PI / 4);
  body.computeVertexNormals();
  const pyramid = addMesh(group, body, stone, 0, spot.height / 2, 0);
  pyramid.name = "pyramid-sloped-masonry";
  addMesh(group, new THREE.BoxGeometry(spot.base + 0.5, 0.65, spot.base + 0.5), dark, 0, 0.2, 0);
  const capHeight = Math.min(2.6, spot.height * 0.13);
  const cap = new THREE.ConeGeometry(spot.base / Math.SQRT2 * capHeight / spot.height * 1.02, capHeight, 4);
  cap.rotateY(Math.PI / 4);
  addMesh(group, cap, gold, 0, spot.height - capHeight / 2 + 0.02, 0);

  if (spot.door !== false) {
    const doorWidth = Math.min(spot.base * 0.14, 6);
    const doorHeight = Math.min(spot.height * 0.22, 7.5);
    const portal = addMesh(
      group,
      new THREE.BoxGeometry(doorWidth, doorHeight, 0.5),
      outlinedMaterial(0x241a12, 0.0006),
      0,
      doorHeight / 2,
      spot.base / 2 + 0.18,
    );
    portal.name = "pyramid-door";
    addMesh(
      group,
      new THREE.BoxGeometry(doorWidth + 2, 0.8, doorHeight * 0.9),
      gold,
      0,
      doorHeight + 0.4,
      spot.base / 2 - doorHeight * 0.4,
    );
    for (const side of [-1, 1]) {
      addMesh(
        group,
        new THREE.BoxGeometry(0.8, doorHeight + 0.8, doorHeight * 0.9),
        gold,
        side * (doorWidth / 2 + 0.8),
        doorHeight / 2,
        spot.base / 2 - doorHeight * 0.4,
      );
    }
    const sun = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 0.16, 16),
      gold,
    );
    sun.rotation.x = Math.PI / 2;
    sun.position.set(0, doorHeight + 2.2, spot.base / 2 + 0.4);
    group.add(sun);
  }

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

/** Temple column, whole or fallen, to compose ruins outside the track. */
export function createRuinColumn(spot: RuinColumnPlacement): THREE.Group {
  const group = new THREE.Group();
  const stone = outlinedMaterial(0xc79a5b, 0.0009);
  const dark = outlinedMaterial(0x9c723f, 0.0009);
  const height = spot.height ?? 4.5;

  if (spot.fallen) {
    const column = addMesh(
      group,
      new THREE.CylinderGeometry(0.72, 0.82, height, 8),
      stone,
      0,
      0.72,
      0,
    );
    column.rotation.z = Math.PI / 2;
    column.rotation.y = spot.rotation ?? 0;
    addMesh(group, new THREE.BoxGeometry(1.7, 0.5, 1.7), dark, -height / 2, 0.5, 0);
    addMesh(group, new THREE.BoxGeometry(1.7, 0.5, 1.7), dark, height / 2, 0.5, 0);
  } else {
    addMesh(group, new THREE.BoxGeometry(2.2, 0.55, 2.2), dark, 0, 0.28, 0);
    addMesh(group, new THREE.BoxGeometry(1.65, 0.32, 1.65), stone, 0, 0.7, 0);
    const shaft = addMesh(
      group,
      new THREE.CylinderGeometry(0.6, 0.72, height, 8),
      stone,
      0,
      0.86 + height / 2,
      0,
    );
    shaft.rotation.y = Math.PI / 8;
    addMesh(group, new THREE.BoxGeometry(1.75, 0.5, 1.75), stone, 0, 0.86 + height + 0.25, 0);
    addMesh(group, new THREE.BoxGeometry(1.95, 0.22, 1.95), dark, 0, 0.86 + height + 0.58, 0);
    // A broken top: small displaced blocks.
    for (const [dx, dz, size] of [[0.3, 0.1, 0.55], [-0.32, 0.22, 0.42]] as const) {
      addMesh(
        group,
        new THREE.BoxGeometry(size, 0.3, size),
        stone,
        dx,
        0.86 + height + 0.82,
        dz,
      );
    }
  }

  group.position.set(spot.x, 0, spot.z);
  group.rotation.y = spot.rotation ?? 0;
  return group;
}
