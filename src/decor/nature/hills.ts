import * as THREE from "three";
import { inkOutline, outlinedMaterial } from "../../rendering/cel-shading";
import { terrainMaterial, type TerrainFinish } from "../../rendering/terrain-material";

export interface HillSpot {
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

/**
 * Morros facetados. Com `finish`, usam a mesma textura do chão, então parecem
 * parte do terreno em vez de um volume liso pousado sobre ele.
 */
export function buildHills(
  spots: readonly HillSpot[],
  parent: THREE.Group,
  color = 0x6f9052,
  finish?: TerrainFinish,
): void {
  const material = finish ? terrainMaterial(color, finish) : outlinedMaterial(color);
  if (finish) inkOutline(material, 0.0012, 0x000000);

  for (const hill of spots) {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      material,
    );
    mesh.position.set(hill.x, 0, hill.z);
    mesh.scale.set(hill.sx, hill.sy, hill.sz);
    mesh.receiveShadow = finish !== undefined;
    parent.add(mesh);
  }
}

/**
 * Altura aproximada da encosta em (x, z); 0 fora do morro. As faces planas
 * ficam um pouco dentro da elipse, então o valor é reduzido para nada flutuar.
 */
export function hillHeightAt(hill: HillSpot, x: number, z: number): number {
  const u = (x - hill.x) / hill.sx;
  const v = (z - hill.z) / hill.sz;
  const radial = u * u + v * v;
  return radial >= 1 ? 0 : hill.sy * Math.sqrt(1 - radial) * 0.92;
}
