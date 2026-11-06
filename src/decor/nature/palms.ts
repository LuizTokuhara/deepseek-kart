import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { celMaterial, outlinedMaterial } from "../../rendering/cel-shading";
import { createInstancedOutline } from "../../rendering/instanced-outline";
import { applyWind, windDepthMaterial, type WindOptions } from "../../rendering/wind";
import { batch, type Placement } from "../common";

/** Folded, serrated fronds also work at the smaller scale of ground plants. */
function fronds(
  count: number,
  length: number,
  height: number,
  phase = 0,
  arch = 0.25,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const rows = 10;
  for (let leaf = 0; leaf < count; leaf++) {
    const angle = leaf / count * Math.PI * 2 + phase;
    const leafLength = length * (0.91 + 0.09 * Math.sin(leaf * 2.4 + 1));
    const base = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const reach = t * leafLength;
      const y =
        height +
        Math.sin(t * Math.PI) * leafLength * arch -
        t * t * length * 0.27;
      const width =
        Math.sin(t * Math.PI) ** 0.7 * length * 0.16 * (row % 2 ? 0.78 : 1);
      for (const side of [-1, 0, 1]) {
        positions.push(
          Math.sin(angle) * reach + Math.cos(angle) * width * side,
          y + (side === 0 ? Math.sin(t * Math.PI) * 0.12 : 0),
          Math.cos(angle) * reach - Math.sin(angle) * width * side,
        );
        const color = new THREE.Color(side < 0 ? 0x5eaa50 : 0x39864b);
        if (t > 0.7) color.lerp(new THREE.Color(0x91b95a), (t - 0.7) * 1.4);
        colors.push(color.r, color.g, color.b);
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
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface PalmAssets {
  wind: WindOptions;
  depthMaterial: THREE.MeshDepthMaterial;
  trunk: THREE.BufferGeometry;
  trunkMaterial: THREE.Material;
  leaves: THREE.BufferGeometry;
  leafMaterial: THREE.Material;
  coconuts: THREE.BufferGeometry;
  coconutMaterial: THREE.Material;
}

export type PalmVariant = "arching" | "compact" | "tall";
export interface PalmPlacement extends Placement { variant?: PalmVariant }
const palmVariants: readonly PalmVariant[] = ["arching", "compact", "tall"];
const palmAssets = new Map<PalmVariant, PalmAssets>();

function getPalmAssets(variant: PalmVariant): PalmAssets {
  const cached = palmAssets.get(variant);
  if (cached) return cached;
  const height = variant === "compact" ? 4.8 : variant === "tall" ? 7.2 : 6;
  const lean = variant === "arching" ? 0.8 : 0.3;
  const length = variant === "compact" ? 2.7 : 3.5;

  const trunk = new THREE.CylinderGeometry(0.19, 0.31, height, 7, 12);
  const position = trunk.getAttribute("position");
  const colors: number[] = [];
  const color = new THREE.Color();
  for (let index = 0; index < position.count; index++) {
    const y = position.getY(index) + height / 2;
    position.setXYZ(
      index,
      position.getX(index) + lean * (y / height) ** 2,
      y,
      position.getZ(index) + 0.15 * (y / height) ** 2,
    );
    color.setHex(Math.round(y / 0.6) % 2 ? 0xb7803a : 0xd3a052);
    colors.push(color.r, color.g, color.b);
  }
  trunk.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  trunk.computeVertexNormals();
  const trunkMaterial = celMaterial(0xffffff);
  trunkMaterial.vertexColors = true;

  const lower = fronds(8, length, height);
  const upper = fronds(5, length * 0.7, height + 0.12, 0.36, 0.58);
  const leaves = mergeGeometries([lower, upper], false)!;
  lower.dispose();
  upper.dispose();
  leaves.translate(lean, 0, 0.15);
  // Open, double-sided fronds cannot use an inverted-hull outline:
  // its back faces would cover the entire underside in black.
  const leafMaterial = celMaterial(0xffffff);
  leafMaterial.vertexColors = true;
  leafMaterial.side = THREE.DoubleSide;

  const nuts: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 3; index++) {
    const geometry = new THREE.IcosahedronGeometry(0.22, 1);
    geometry.translate(
      lean + Math.sin(index * 2.1) * 0.25,
      height - 0.2,
      0.15 + Math.cos(index * 2.1) * 0.25,
    );
    nuts.push(geometry);
  }
  const coconuts = mergeGeometries(nuts, false)!;
  nuts.forEach((geometry) => geometry.dispose());
  const coconutMaterial = celMaterial(0xdab04f);
  // The trunk bends from the base, so the crown, fronds and coconuts above
  // it move together; drooping frond tips flex a little less.
  const wind: WindOptions = { strength: 0.2, from: 0.5, to: height, speed: 0.9 };
  for (const material of [trunkMaterial, leafMaterial, coconutMaterial]) applyWind(material, wind);

  const assets = {
    wind,
    depthMaterial: windDepthMaterial(wind),
    trunk,
    trunkMaterial,
    leaves,
    leafMaterial,
    coconuts,
    coconutMaterial,
  };
  palmAssets.set(variant, assets);
  return assets;
}

export function createPalmBatches(
  parent: THREE.Group,
  palms: readonly PalmPlacement[],
): void {
  for (const variant of palmVariants) {
    const placements = palms.filter((palm) => (palm.variant ?? palmVariants[
      Math.abs(Math.floor(palm.x * 3 + palm.z * 7)) % palmVariants.length
    ]) === variant);
    if (!placements.length) continue;
    const assets = getPalmAssets(variant);
    const trunks = batch(parent, assets.trunk, assets.trunkMaterial, placements, true);
    trunks.name = `palm-trunks-${variant}`;
    trunks.customDepthMaterial = assets.depthMaterial;
    parent.add(swayingOutline(trunks, 0.65, assets.wind));
    const leaves = batch(parent, assets.leaves, assets.leafMaterial, placements, true);
    leaves.name = `palm-fronds-${variant}`;
    leaves.customDepthMaterial = assets.depthMaterial;
    const nuts = batch(parent, assets.coconuts, assets.coconutMaterial, placements);
    nuts.name = `palm-coconuts-${variant}`;
    parent.add(swayingOutline(nuts, 0.55, assets.wind));
  }
}

function swayingOutline(
  source: THREE.InstancedMesh,
  pixels: number,
  wind: WindOptions,
): THREE.InstancedMesh {
  const outline = createInstancedOutline(source, pixels);
  applyWind(outline.material as THREE.Material, wind);
  return outline;
}

const PLANT_WIND: WindOptions = { strength: 0.05, from: 0.1, to: 0.8, speed: 1.8 };

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
const plantDepthMaterial = windDepthMaterial(PLANT_WIND);

function getPlantAssets(): PlantAssets {
  if (plantAssets) {
    return plantAssets;
  }

  const patch = new THREE.CircleGeometry(1, 7);
  patch.rotateX(-Math.PI / 2);
  patch.scale(2.4, 1, 1.4);
  const frondMaterial = celMaterial(0x327d48);
  frondMaterial.side = THREE.DoubleSide;
  applyWind(frondMaterial, PLANT_WIND);

  plantAssets = {
    patch,
    patchMaterial: celMaterial(0x8fba5a),
    fronds: fronds(5, 0.7, 0.3),
    frondMaterial,
    rock: new THREE.DodecahedronGeometry(1, 0),
    rockMaterial: outlinedMaterial(0xb3aa87, 0.0012),
    flower: new THREE.IcosahedronGeometry(1, 0),
    flowerMaterial: outlinedMaterial(0xef8b65, 0.0007),
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
  const fronds = batch(parent, assets.fronds, assets.frondMaterial, plants, true);
  fronds.name = "tropical-ground-plants";
  fronds.customDepthMaterial = plantDepthMaterial;
  batch(parent, assets.rock, assets.rockMaterial, rocks);
  batch(parent, assets.flower, assets.flowerMaterial, flowers);
}
