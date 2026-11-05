import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { celMaterial } from "../../rendering/cel-shading";
import { batch, type Placement } from "../common";

/** Folded, serrated fronds also work at the smaller scale of ground plants. */
function fronds(
  count: number,
  length: number,
  height: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const rows = 10;
  for (let leaf = 0; leaf < count; leaf++) {
    const angle = leaf / count * Math.PI * 2;
    const base = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const reach = t * length;
      const y =
        height +
        Math.sin(t * Math.PI) * length * 0.25 -
        t * t * length * 0.27;
      const width =
        Math.sin(t * Math.PI) ** 0.7 * length * 0.16 * (row % 2 ? 0.78 : 1);
      for (const side of [-1, 0, 1]) {
        positions.push(
          Math.sin(angle) * reach + Math.cos(angle) * width * side,
          y + (side === 0 ? Math.sin(t * Math.PI) * 0.12 : 0),
          Math.cos(angle) * reach - Math.sin(angle) * width * side,
        );
      }
      if (row < rows) {
        const a = base + row * 3;
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
        indices.push(a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface PalmAssets {
  trunk: THREE.BufferGeometry;
  trunkMaterial: THREE.Material;
  leaves: THREE.BufferGeometry;
  leafMaterial: THREE.Material;
  coconuts: THREE.BufferGeometry;
  coconutMaterial: THREE.Material;
}

let palmAssets: PalmAssets | null = null;

function getPalmAssets(): PalmAssets {
  if (palmAssets) {
    return palmAssets;
  }

  const trunk = new THREE.CylinderGeometry(0.19, 0.31, 6, 7, 10);
  const position = trunk.getAttribute("position");
  const colors: number[] = [];
  const color = new THREE.Color();
  for (let index = 0; index < position.count; index++) {
    const y = position.getY(index) + 3;
    position.setXYZ(
      index,
      position.getX(index) + 0.55 * (y / 6) ** 2,
      y,
      position.getZ(index) + 0.15 * (y / 6) ** 2,
    );
    color.setHex(Math.round(y / 0.6) % 2 ? 0xb7803a : 0xd3a052);
    colors.push(color.r, color.g, color.b);
  }
  trunk.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  trunk.computeVertexNormals();
  const trunkMaterial = celMaterial(0xffffff);
  trunkMaterial.vertexColors = true;

  const leaves = fronds(8, 3.4, 6);
  leaves.translate(0.55, 0, 0.15);
  const leafMaterial = celMaterial(0x3f934a);
  leafMaterial.side = THREE.DoubleSide;

  const nuts: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 3; index++) {
    const geometry = new THREE.IcosahedronGeometry(0.22, 1);
    geometry.translate(
      0.55 + Math.sin(index * 2.1) * 0.25,
      5.8,
      0.15 + Math.cos(index * 2.1) * 0.25,
    );
    nuts.push(geometry);
  }
  const coconuts = mergeGeometries(nuts, false)!;
  nuts.forEach((geometry) => geometry.dispose());
  const coconutMaterial = celMaterial(0xdab04f);

  palmAssets = {
    trunk,
    trunkMaterial,
    leaves,
    leafMaterial,
    coconuts,
    coconutMaterial,
  };
  return palmAssets;
}

export function createPalmBatches(
  parent: THREE.Group,
  palms: readonly Placement[],
): void {
  const assets = getPalmAssets();
  batch(parent, assets.trunk, assets.trunkMaterial, palms, true).name =
    "palm-trunks";
  batch(parent, assets.leaves, assets.leafMaterial, palms, true).name =
    "palm-fronds";
  batch(parent, assets.coconuts, assets.coconutMaterial, palms);
}

interface PlantAssets {
  patch: THREE.BufferGeometry;
  patchMaterial: THREE.Material;
  fronds: THREE.BufferGeometry;
  frondMaterial: THREE.Material;
  rock: THREE.BufferGeometry;
  rockMaterial: THREE.Material;
  flower: THREE.BufferGeometry;
  flowerMaterial: THREE.Material;
}

let plantAssets: PlantAssets | null = null;

function getPlantAssets(): PlantAssets {
  if (plantAssets) {
    return plantAssets;
  }

  const patch = new THREE.CircleGeometry(1, 7);
  patch.rotateX(-Math.PI / 2);
  patch.scale(2.4, 1, 1.4);
  const frondMaterial = celMaterial(0x327d48);
  frondMaterial.side = THREE.DoubleSide;

  plantAssets = {
    patch,
    patchMaterial: celMaterial(0x8fba5a),
    fronds: fronds(5, 0.7, 0.3),
    frondMaterial,
    rock: new THREE.DodecahedronGeometry(1, 0),
    rockMaterial: celMaterial(0xb3aa87),
    flower: new THREE.IcosahedronGeometry(1, 0),
    flowerMaterial: celMaterial(0xef8b65),
  };
  return plantAssets;
}

export function createGroundPlantBatches(
  parent: THREE.Group,
  plants: readonly Placement[],
  rocks: readonly Placement[],
  flowers: readonly Placement[],
  patches: readonly Placement[],
): void {
  const assets = getPlantAssets();
  batch(parent, assets.patch, assets.patchMaterial, patches);
  batch(
    parent,
    assets.fronds,
    assets.frondMaterial,
    plants,
    true,
  ).name = "tropical-ground-plants";
  batch(parent, assets.rock, assets.rockMaterial, rocks);
  batch(parent, assets.flower, assets.flowerMaterial, flowers);
}
