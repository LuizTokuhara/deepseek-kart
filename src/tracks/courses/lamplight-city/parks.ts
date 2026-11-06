import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GROUND_Y } from "../../../core/config";
import type { ColliderBox } from "../../../core/types";
import { buildTrees, type TreeSpot } from "../../../decor";
import { randomGenerator } from "../../../decor/common";
import type { StreetLamp } from "../../../decor/city/street-lights";
import { celMaterial } from "../../../rendering/cel-shading";
import { terrainMaterial } from "../../../rendering/terrain-material";
import { PARKS } from "./city-plan";

/** Meia largura dos caminhos em cruz que atravessam cada parque. */
const PATH_HALF = 1.3;
export const LAWN_COLOR = 0x4b7a43;

/** Gramado de algum parque, fora dos caminhos e longe do meio-fio. */
export function onLawn(x: number, z: number): boolean {
  return PARKS.some((park) => {
    const dx = Math.abs(x - park.x);
    const dz = Math.abs(z - park.z);
    return dx < park.width / 2 - 1 && dz < park.depth / 2 - 1 &&
      dx > PATH_HALF + 0.4 && dz > PATH_HALF + 0.4 && Math.hypot(dx, dz) > 4.2;
  });
}

function benchGeometry(): THREE.BufferGeometry {
  const parts = [
    new THREE.BoxGeometry(1.7, 0.08, 0.5).translate(0, 0.45, 0),
    new THREE.BoxGeometry(1.7, 0.42, 0.07).translate(0, 0.72, -0.22),
    new THREE.BoxGeometry(0.08, 0.45, 0.45).translate(-0.72, 0.22, 0),
    new THREE.BoxGeometry(0.08, 0.45, 0.45).translate(0.72, 0.22, 0),
  ];
  const merged = mergeGeometries(parts)!;
  parts.forEach((part) => part.dispose());
  return merged;
}

export interface ParkSet {
  readonly group: THREE.Group;
  readonly colliders: ColliderBox[];
  readonly lamps: StreetLamp[];
}

/**
 * Praças arborizadas: gramado com meio-fio, caminhos de pedra em cruz,
 * árvores nos quatro canteiros, bancos virados para o centro, postes nos
 * caminhos e um chafariz no centro da praça menor.
 */
export function createParks(): ParkSet {
  const group = new THREE.Group();
  group.name = "city-parks";
  const colliders: ColliderBox[] = [];
  const lamps: StreetLamp[] = [];
  const trees: TreeSpot[] = [];
  const benches: THREE.Matrix4[] = [];
  const random = randomGenerator(2719);
  const lawn = terrainMaterial(LAWN_COLOR, "grass");
  const stone = terrainMaterial(0xa49f96, "stone");
  const curb = celMaterial(0x9a978f);
  const dummy = new THREE.Object3D();

  for (const park of PARKS) {
    const flat = (width: number, depth: number) =>
      new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2);
    const grass = new THREE.Mesh(flat(park.width, park.depth), lawn);
    grass.position.set(park.x, 0.05, park.z);
    grass.receiveShadow = true;
    group.add(grass);
    for (const [width, depth] of [[park.width, PATH_HALF * 2], [PATH_HALF * 2, park.depth]]) {
      const path = new THREE.Mesh(flat(width, depth), stone);
      path.position.set(park.x, 0.07, park.z);
      path.receiveShadow = true;
      group.add(path);
    }
    for (const side of [-1, 1]) {
      for (const [width, depth, x, z] of [
        [park.width + 0.4, 0.4, park.x, park.z + side * park.depth / 2],
        [0.4, park.depth + 0.4, park.x + side * park.width / 2, park.z],
      ]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(width, 0.24, depth), curb);
        edge.position.set(x, 0.12, z);
        edge.receiveShadow = true;
        group.add(edge);
      }
    }

    // Árvores nos quatro canteiros, longe dos caminhos e da borda.
    for (let attempt = 0; attempt < park.width * park.depth / 30; attempt++) {
      const x = park.x + (random() - 0.5) * (park.width - 5);
      const z = park.z + (random() - 0.5) * (park.depth - 5);
      const nearPath = Math.min(Math.abs(x - park.x), Math.abs(z - park.z)) < PATH_HALF + 2.2;
      if (nearPath) continue;
      if (trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < 5)) continue;
      const scale = 0.9 + random() * 0.5;
      trees.push({ x, y: 0.05, z, scale, rotation: random() * Math.PI * 2,
        foliage: random() > 0.5 ? "a" : "b", variant: random() > 0.6 ? "column" : "round" });
      colliders.push({ center: { x, y: 1.325 * scale, z },
        half: { x: 0.32 * scale, y: 1.325 * scale, z: 0.32 * scale }, yaw: 0 });
    }

    // Bancos olhando para o centro e postes nos quatro braços dos caminhos.
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const reach = (dx !== 0 ? park.width : park.depth) * 0.3;
      dummy.position.set(park.x + dx * reach - dz * (PATH_HALF + 0.5), 0.07,
        park.z + dz * reach + dx * (PATH_HALF + 0.5));
      dummy.rotation.set(0, Math.atan2(dz, -dx) + Math.PI / 2, 0);
      dummy.updateMatrix();
      benches.push(dummy.matrix.clone());
      const lampX = park.x + dx * reach + dz * (PATH_HALF + 0.4);
      const lampZ = park.z + dz * reach - dx * (PATH_HALF + 0.4);
      lamps.push({ x: lampX, y: 0.07, z: lampZ, yaw: Math.atan2(-dz, dx) + Math.PI / 2, height: 4.2,
        pool: { x: lampX - dz * 1.2, y: GROUND_Y + 0.02, z: lampZ + dx * 1.2, radius: 4.5,
          yaw: 0, pitch: 0 } });
    }
  }

  const fountainPark = PARKS[PARKS.length - 1];
  const fountain = new THREE.Group();
  fountain.position.set(fountainPark.x, 0.07, fountainPark.z);
  const masonry = celMaterial(0xb3ada3, 0.002);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.6, 24), masonry);
  basin.position.y = 0.3;
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.85, 24).rotateX(-Math.PI / 2),
    celMaterial(0x2f6f8f));
  water.position.y = 0.52;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 2.2, 10), masonry);
  column.position.y = 1.1;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.4, 0.35, 16), masonry);
  bowl.position.y = 2.2;
  fountain.add(basin, water, column, bowl);
  fountain.traverse((part) => {
    part.castShadow = part.receiveShadow = true;
  });
  group.add(fountain);
  colliders.push({ center: { x: fountainPark.x, y: 1, z: fountainPark.z },
    half: { x: 3.3, y: 1, z: 3.3 }, yaw: 0 });

  buildTrees(trees, group);
  const wood = celMaterial(0x7d5536, 0.002);
  const bench = new THREE.InstancedMesh(benchGeometry(), wood, benches.length);
  benches.forEach((matrix, index) => bench.setMatrixAt(index, matrix));
  bench.castShadow = bench.receiveShadow = true;
  bench.name = "park-benches";
  group.add(bench);
  return { group, colliders, lamps };
}
