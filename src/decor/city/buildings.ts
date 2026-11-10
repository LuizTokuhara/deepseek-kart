import * as THREE from "three";
import type { ColliderBox } from "../../core/types";
import { celMaterial } from "../../rendering/cel-shading";
import { FACADE_STYLE, facadeBoxGeometry, facadeMaterial } from "../../rendering/facade-material";
import { glowColor } from "../../rendering/glow";
import { createInstancedOutline } from "../../rendering/instanced-outline";
import { BLOB_SHADOW_FLAG } from "../../rendering/blob-shadows";

export type BuildingKind = keyof typeof FACADE_STYLE;

/** A lot: the front (+z local) faces the street. */
export interface BuildingLot {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly kind: BuildingKind;
  readonly color: number;
  /** Fraction of lit windows. */
  readonly lit: number;
  readonly seed: number;
  /** Color of the shop awnings and the house roofs. */
  readonly accent?: number;
}

export interface BuildingOptions {
  /** Skyline buildings: no collision, shadow or outline. */
  readonly distant?: boolean;
}

export interface BuildingSet {
  readonly group: THREE.Group;
  readonly colliders: ColliderBox[];
  /** Material of the warning lights on top of tall buildings (blinks in `update`). */
  readonly beacons: THREE.MeshBasicMaterial;
}

/** Floor height per facade style, in meters. */
export const FLOOR_HEIGHT: Record<BuildingKind, number> = { office: 3.4, house: 3, shop: 3.2 };

function isToonMaterial(material: THREE.Material | THREE.Material[]): boolean {
  if (Array.isArray(material)) return material.some(isToonMaterial);
  return (material as { isMeshToonMaterial?: boolean }).isMeshToonMaterial === true ||
    (material as { isMeshToonNodeMaterial?: boolean }).isMeshToonNodeMaterial === true;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const roofGeometry = (() => {
  // Prism with a 1 × 1 base and the ridge along x, at y = 1.
  const geometry = new THREE.BufferGeometry();
  const p = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0];
  const faces = [0, 4, 1, 1, 4, 5, 3, 2, 4, 2, 5, 4, 0, 3, 4, 1, 5, 2, 0, 1, 2, 0, 2, 3];
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(
    faces.flatMap((index) => p.slice(index * 3, index * 3 + 3)), 3));
  geometry.computeVertexNormals();
  return geometry;
})();

class Parts {
  readonly matrices: THREE.Matrix4[] = [];
  readonly colors: THREE.Color[] = [];
  private readonly dummy = new THREE.Object3D();

  add(lot: BuildingLot, x: number, y: number, z: number, sx: number, sy: number, sz: number,
    color?: number, pitch = 0): void {
    const cos = Math.cos(lot.yaw);
    const sin = Math.sin(lot.yaw);
    this.dummy.position.set(lot.x + x * cos + z * sin, y, lot.z - x * sin + z * cos);
    this.dummy.rotation.set(pitch, lot.yaw, 0, "YXZ");
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    this.matrices.push(this.dummy.matrix.clone());
    this.colors.push(new THREE.Color(color ?? 0xffffff));
  }

  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string,
    shadows: boolean): THREE.InstancedMesh | null {
    if (this.matrices.length === 0) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, this.matrices.length);
    this.matrices.forEach((matrix, index) => {
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, this.colors[index]);
    });
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = shadows;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

/** Front doors, low-floor relief and roof joinery share a few instance batches. */
function addBuildingDetails(lot: BuildingLot, relief: Parts, glass: Parts, awnings: Parts, seams: Parts): void {
  const accent = lot.accent ?? 0x526777;
  const pale = 0xd8d2bf;
  const front = lot.depth / 2;
  const house = lot.kind === "house";
  const entranceX = house ? -lot.width * 0.2 : lot.kind === "shop" ? lot.width * 0.25 : 0;
  const doorWidth = house ? 1.05 : lot.kind === "shop" ? 1.5 : 2.5;
  const doorHeight = house ? 2.1 : 2.65;
  glass.add(lot, entranceX, doorHeight / 2, front + 0.08, doorWidth, doorHeight, 0.08, 0x293c48);
  for (const side of [-1, 1]) {
    relief.add(lot, entranceX + side * (doorWidth / 2 + 0.07), doorHeight / 2,
      front + 0.14, 0.14, doorHeight + 0.12, 0.16, pale);
  }
  relief.add(lot, entranceX, doorHeight + 0.08, front + 0.14, doorWidth + 0.28, 0.16, 0.16, pale);
  relief.add(lot, entranceX + doorWidth * 0.3, 1.05, front + 0.2, 0.05, 0.35, 0.07, 0xc3a867);
  relief.add(lot, entranceX, 0.08, front + 0.35, doorWidth + 0.6, 0.16, 0.7, 0x898c88);
  if (lot.kind !== "shop") {
    awnings.add(lot, entranceX, doorHeight + 0.6, front + 0.5,
      doorWidth + (house ? 0.8 : 1.6), 0.16, 1.1, accent, house ? 0.12 : 0);
  }

  // Match the shader's bay spacing and floor centers; only nearby floors need relief.
  for (let face = 0; face < 4; face++) {
    const width = face % 2 ? lot.depth : lot.width;
    const depth = face % 2 ? lot.width : lot.depth;
    const sideLot = { ...lot, yaw: lot.yaw + face * Math.PI / 2 };
    const bays = Math.max(1, Math.floor((width - 1.6) / 2.6));
    const bayWidth = (width - 1.6) / bays;
    const base = house ? 0.5 : lot.kind === "shop" ? 4.3 : 1.1;
    const floorHeight = FLOOR_HEIGHT[lot.kind];
    const topMargin = house ? 0.35 : 0.7;
    for (let row = 0; row < 2; row++) {
      if (base + (row + 1) * floorHeight > lot.height - topMargin + 0.01) continue;
      for (let column = 0; column < bays; column++) {
        const x = width / 2 - 0.8 - (column + 0.5) * bayWidth;
        const y = base + (row + 0.55) * floorHeight;
        if (face === 0 && row === 0 && Math.abs(x - entranceX) < doorWidth / 2 + 0.65) continue;
        const paneWidth = bayWidth * (house ? 0.4 : 0.6);
        relief.add(sideLot, x, y - floorHeight * 0.29, depth / 2 + 0.13,
          paneWidth + 0.25, 0.13, 0.3, pale);
        if (!house) continue;
        relief.add(sideLot, x, y + floorHeight * 0.29, depth / 2 + 0.07,
          paneWidth + 0.2, 0.12, 0.16, pale);
        for (const side of [-1, 1]) {
          relief.add(sideLot, x + side * (paneWidth / 2 + 0.04), y, depth / 2 + 0.07,
            0.1, floorHeight * 0.58, 0.14, pale);
          if (lot.seed % 3 !== 1) {
            relief.add(sideLot, x + side * (paneWidth / 2 + 0.28), y, depth / 2 + 0.09,
              0.34, floorHeight * 0.56, 0.16, accent);
            for (const offset of [-0.32, 0.32]) relief.add(sideLot,
              x + side * (paneWidth / 2 + 0.28), y + offset, depth / 2 + 0.18,
              0.3, 0.045, 0.04, 0xb6aa90);
          }
        }
        // Selected houses get a shallow balcony, kept within the old awning reach.
        if (face === 0 && row === 1 && column === 0 && lot.seed % 3 === 0) {
          const balconyWidth = paneWidth + 0.5;
          relief.add(lot, x, y - 0.95, front + 0.35, balconyWidth, 0.15, 0.75, pale);
          relief.add(lot, x, y - 0.22, front + 0.68, balconyWidth, 0.07, 0.07, accent);
          for (let post = 0; post < 5; post++) relief.add(lot,
            x + (post / 4 - 0.5) * balconyWidth, y - 0.56, front + 0.68,
            0.055, 0.65, 0.055, accent);
        }
      }
    }
  }

  if (house) {
    const roofHeight = Math.min(3.2, lot.depth * 0.32);
    const roofDepth = lot.depth + 0.7;
    const roofSlope = Math.atan2(roofHeight, roofDepth / 2);
    const roofLength = Math.hypot(roofHeight, roofDepth / 2);
    relief.add(lot, 0, lot.height + roofHeight + 0.03, 0, lot.width + 0.55, 0.18, 0.2, accent);
    for (const side of [-1, 1]) {
      relief.add(lot, 0, lot.height + 0.02, side * (lot.depth / 2 + 0.32),
        lot.width + 0.6, 0.18, 0.16, pale);
      for (let seam = 0; seam < 6; seam++) seams.add(lot,
        (seam / 5 - 0.5) * lot.width, lot.height + roofHeight / 2 + 0.05,
        side * roofDepth / 4, 0.07, 0.05, roofLength, 0xa47d65, side * roofSlope);
    }
  } else if (lot.kind === "shop") {
    const width = lot.width - 1.4;
    for (let stripe = 0; stripe < 7; stripe += 2) awnings.add(lot,
      (stripe / 7 - 0.5) * width + width / 14, 3.81, front + 0.77,
      width / 7, 0.025, 1.69, 0xe6dfc6, 0.32);
    awnings.add(lot, 0, 3.4, front + 1.54, width, 0.23, 0.07, accent);
    for (let x = -lot.width / 2 + 0.6; x < lot.width / 2 - 0.5; x += 2.1) {
      relief.add(lot, x, 1.95, front + 0.07, 0.1, 3.3, 0.16, 0x45515b);
    }
    // Keep the plate behind the course's neon sign plane at front + 0.13 m.
    relief.add(lot, 0, 4.55, front + 0.035, lot.width - 1.2, 1.1, 0.1, accent);
  } else {
    const band = new THREE.Color(lot.color).lerp(new THREE.Color(0xe2d9c5), 0.35).getHex();
    for (let y = 1.1 + FLOOR_HEIGHT.office; y < lot.height - 0.7; y += FLOOR_HEIGHT.office) {
      for (const side of [-1, 1]) {
        relief.add(lot, 0, y, side * (lot.depth / 2 + 0.04), lot.width + 0.16, 0.13, 0.18, band);
        relief.add(lot, side * (lot.width / 2 + 0.04), y, 0, 0.18, 0.13, lot.depth + 0.16, band);
      }
    }
    for (const side of [-1, 1]) relief.add(lot,
      side * (lot.width / 2 - 0.22), lot.height / 2, front + 0.07,
      0.3, lot.height, 0.2, band);
    relief.add(lot, 0, 0.22, front + 0.05, lot.width, 0.44, 0.18, 0x45515b);
  }
}

/**
 * Builds houses, shops and offices into instanced lots: one body with a lit
 * facade per building, plus roofs, awnings and rooftop equipment.
 */
export function buildBuildings(lots: readonly BuildingLot[], options: BuildingOptions = {}):
  BuildingSet {
  const group = new THREE.Group();
  group.name = options.distant ? "skyline" : "city-buildings";
  const colliders: ColliderBox[] = [];
  const bodies = new Parts();
  const roofs = new Parts();
  const trims = new Parts();
  const awnings = new Parts();
  const beaconParts = new Parts();
  const porches = new Parts();
  const relief = new Parts();
  const glazing = new Parts();
  const seams = new Parts();

  for (const lot of lots) {
    bodies.add(lot, 0, 0, 0, lot.width, lot.height, lot.depth, lot.color);
    if (!options.distant) {
      colliders.push({
        center: { x: lot.x, y: lot.height / 2, z: lot.z },
        half: { x: lot.width / 2, y: lot.height / 2, z: lot.depth / 2 },
        yaw: lot.yaw,
      });
    }
    if (!options.distant) addBuildingDetails(lot, relief, glazing, awnings, seams);
    if (lot.kind === "house") {
      const roofHeight = Math.min(3.2, lot.depth * 0.32);
      roofs.add(lot, 0, lot.height, 0, lot.width + 0.5, roofHeight, lot.depth + 0.7, lot.accent);
      trims.add(lot, lot.width * 0.28, lot.height + roofHeight * 0.45, -lot.depth * 0.15,
        0.7, roofHeight * 1.1, 0.7, 0x7a4a3a);
      trims.add(lot, -lot.width * 0.2, 1.05, lot.depth / 2 + 0.03, 1.05, 2.1, 0.06, 0x5c3b2b);
      porches.add(lot, -lot.width * 0.2, 2.45, lot.depth / 2 + 0.12, 0.22, 0.22, 0.2);
    } else if (lot.kind === "shop") {
      // Slanted awning over the storefront and dark trim for the sign.
      awnings.add(lot, 0, 3.75, lot.depth / 2 + 0.75, lot.width - 1.4, 0.1, 1.7,
        lot.accent, 0.32);
      trims.add(lot, 0, 4.15, lot.depth / 2 + 0.05, lot.width - 0.6, 0.3, 0.1, 0x262833);
    } else if (!options.distant || lot.height > 30) {
      if (options.distant) {
        trims.add(lot, 0, lot.height + 0.35, 0, lot.width + 0.3, 0.7, lot.depth + 0.3, lot.color);
      } else {
        // Open parapets reveal the roof deck and the equipment inside it.
        for (const side of [-1, 1]) {
          trims.add(lot, 0, lot.height + 0.32, side * lot.depth / 2,
            lot.width + 0.3, 0.64, 0.3, lot.color);
          trims.add(lot, side * lot.width / 2, lot.height + 0.32, 0,
            0.3, 0.64, lot.depth, lot.color);
        }
      }
      if (lot.height > 22) {
        trims.add(lot, lot.width * 0.18, lot.height + 1.3, -lot.depth * 0.12,
          lot.width * 0.32, 1.6, lot.depth * 0.3, 0x6b7280);
        trims.add(lot, -lot.width * 0.25, lot.height + 2.6, lot.depth * 0.2, 0.12, 4.2, 0.12,
          0x3a3f4a);
        beaconParts.add(lot, -lot.width * 0.25, lot.height + 4.8, lot.depth * 0.2, 0.35, 0.35,
          0.35);
      } else {
        trims.add(lot, -lot.width * 0.2, lot.height + 1.1, 0, 2.2, 1.2, 1.6, 0x8b8f99);
      }
    }
  }

  const shadows = !options.distant;
  const facadeData = lots.map((lot) => ({
    seed: lot.seed, lit: lot.lit, style: FACADE_STYLE[lot.kind],
    floorHeight: FLOOR_HEIGHT[lot.kind],
  }));
  const body = bodies.mesh(facadeBoxGeometry(facadeData), facadeMaterial(), "building-bodies",
    shadows);
  const beacons = new THREE.MeshBasicMaterial({ color: glowColor(0xff3b30) });
  beacons.userData.outlineParameters = { visible: false };
  const porchLight = new THREE.MeshBasicMaterial({ color: glowColor(0xffc77a, 2) });
  porchLight.userData.outlineParameters = { visible: false };
  const reliefMesh = relief.mesh(unitBox, celMaterial(0xffffff), "building-facade-relief", shadows);
  const glazingMesh = glazing.mesh(unitBox, celMaterial(0xffffff), "building-door-glass", shadows);
  const seamMesh = seams.mesh(unitBox, celMaterial(0xffffff), "building-roof-seams", shadows);
  const fineDetails = new Set([reliefMesh, glazingMesh, seamMesh]);
  for (const mesh of [
    body, reliefMesh, glazingMesh, seamMesh,
    roofs.mesh(roofGeometry, celMaterial(0xffffff), "building-roofs", shadows),
    trims.mesh(unitBox, celMaterial(0xffffff), "building-trims", shadows),
    awnings.mesh(unitBox, celMaterial(0xffffff), "shop-awnings", shadows),
    beaconParts.mesh(new THREE.SphereGeometry(0.5, 8, 6), beacons, "rooftop-beacons", false),
    porches.mesh(unitBox, porchLight, "porch-lights", false),
  ]) {
    if (!mesh) continue;
    // Buildings are too large for the blob shadow; only the real shadow.
    mesh.userData[BLOB_SHADOW_FLAG] = false;
    group.add(mesh);
    if (!options.distant && !fineDetails.has(mesh) && isToonMaterial(mesh.material)) {
      group.add(createInstancedOutline(mesh, mesh === body ? 1.1 : 0.9));
    }
  }
  return { group, colliders, beacons };
}
