import * as THREE from "three";
import type { ColliderBox } from "../../core/types";
import { celMaterial } from "../../rendering/cel-shading";
import { FACADE_STYLE, facadeBoxGeometry, facadeMaterial } from "../../rendering/facade-material";
import { glowColor } from "../../rendering/glow";
import { createInstancedOutline } from "../../rendering/instanced-outline";
import { BLOB_SHADOW_FLAG } from "../../rendering/blob-shadows";

export type BuildingKind = keyof typeof FACADE_STYLE;

/** Um lote: a frente (+z local) olha para a rua. */
export interface BuildingLot {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly kind: BuildingKind;
  readonly color: number;
  /** Fração de janelas acesas. */
  readonly lit: number;
  readonly seed: number;
  /** Cor do toldo das lojas e do telhado das casas. */
  readonly accent?: number;
}

export interface BuildingOptions {
  /** Prédios do horizonte: sem colisão, sombra nem contorno. */
  readonly distant?: boolean;
}

export interface BuildingSet {
  readonly group: THREE.Group;
  readonly colliders: ColliderBox[];
  /** Material das luzes de aviso no topo dos prédios altos (pisca em `update`). */
  readonly beacons: THREE.MeshBasicMaterial;
}

/** Altura do andar por estilo de fachada, em metros. */
export const FLOOR_HEIGHT: Record<BuildingKind, number> = { office: 3.4, house: 3, shop: 3.2 };

function isToonMaterial(material: THREE.Material | THREE.Material[]): boolean {
  if (Array.isArray(material)) return material.some(isToonMaterial);
  return (material as { isMeshToonMaterial?: boolean }).isMeshToonMaterial === true ||
    (material as { isMeshToonNodeMaterial?: boolean }).isMeshToonNodeMaterial === true;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const roofGeometry = (() => {
  // Prisma de base 1 × 1 com a cumeeira ao longo de x, em y = 1.
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

/**
 * Monta casas, lojas e escritórios em lotes instanciados: um corpo com
 * fachada iluminada por prédio, mais telhados, toldos e equipamentos de topo.
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

  for (const lot of lots) {
    bodies.add(lot, 0, 0, 0, lot.width, lot.height, lot.depth, lot.color);
    if (!options.distant) {
      colliders.push({
        center: { x: lot.x, y: lot.height / 2, z: lot.z },
        half: { x: lot.width / 2, y: lot.height / 2, z: lot.depth / 2 },
        yaw: lot.yaw,
      });
    }
    if (lot.kind === "house") {
      const roofHeight = Math.min(3.2, lot.depth * 0.32);
      roofs.add(lot, 0, lot.height, 0, lot.width + 0.5, roofHeight, lot.depth + 0.7, lot.accent);
      trims.add(lot, lot.width * 0.28, lot.height + roofHeight * 0.45, -lot.depth * 0.15,
        0.7, roofHeight * 1.1, 0.7, 0x7a4a3a);
      trims.add(lot, -lot.width * 0.2, 1.05, lot.depth / 2 + 0.03, 1.05, 2.1, 0.06, 0x5c3b2b);
      porches.add(lot, -lot.width * 0.2, 2.45, lot.depth / 2 + 0.12, 0.22, 0.22, 0.2);
    } else if (lot.kind === "shop") {
      // Toldo inclinado sobre a vitrine e friso escuro do letreiro.
      awnings.add(lot, 0, 3.75, lot.depth / 2 + 0.75, lot.width - 1.4, 0.1, 1.7,
        lot.accent, 0.32);
      trims.add(lot, 0, 4.15, lot.depth / 2 + 0.05, lot.width - 0.6, 0.3, 0.1, 0x262833);
    } else if (!options.distant || lot.height > 30) {
      trims.add(lot, 0, lot.height + 0.35, 0, lot.width + 0.3, 0.7, lot.depth + 0.3, lot.color);
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
  for (const mesh of [
    body,
    roofs.mesh(roofGeometry, celMaterial(0xffffff), "building-roofs", shadows),
    trims.mesh(unitBox, celMaterial(0xffffff), "building-trims", shadows),
    awnings.mesh(unitBox, celMaterial(0xffffff), "shop-awnings", shadows),
    beaconParts.mesh(new THREE.SphereGeometry(0.5, 8, 6), beacons, "rooftop-beacons", false),
    porches.mesh(unitBox, porchLight, "porch-lights", false),
  ]) {
    if (!mesh) continue;
    // Prédios são grandes demais para a sombra de mancha; só a sombra real.
    mesh.userData[BLOB_SHADOW_FLAG] = false;
    group.add(mesh);
    if (!options.distant && isToonMaterial(mesh.material)) {
      group.add(createInstancedOutline(mesh, mesh === body ? 1.1 : 0.9));
    }
  }
  return { group, colliders, beacons };
}
