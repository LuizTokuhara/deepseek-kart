import * as THREE from "three";
import { randomGenerator } from "../../../decor/common";
import { mergeStaticDecoration } from "../../../decor/merge-static";
import { columnDrumGeometry, weatheredBlockGeometry } from "../../../decor/props/stone-shapes";
import { createPalmBatches } from "../../../decor/nature/palms";
import { outlinedMaterial } from "../../../rendering/cel-shading";
import { terrainMaterial } from "../../../rendering/terrain-material";
import type { ColliderBox } from "../../../core/types";
import type { TrackLike } from "../../track";
import { distanceToRoute } from "./dunes";

/** Composed archaeological sites and repeated wayside details. Static geometry
 * is baked by material, so the richer set dressing stays inexpensive to draw. */
export class SunstoneDetails {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  private readonly stone = terrainMaterial(0xd6b47b, "stone");
  private readonly light = outlinedMaterial(0xe8cf98, 0.0006);
  private readonly dark = outlinedMaterial(0x967047, 0.0005);
  private readonly teal = outlinedMaterial(0x286e71, 0.0005);
  private readonly gold = outlinedMaterial(0xdcb567, 0.0005);
  private readonly clay = outlinedMaterial(0xb46c45, 0.0006);
  private readonly random = randomGenerator(7393);

  constructor(private readonly track: TrackLike) {
    this.group.name = "sunstone-archaeological-sites";
    this.temple();
    this.processionalWay();
    this.roadside();
    this.oasisQuay();
    mergeStaticDecoration(this.group);
  }

  private mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private box(parent: THREE.Object3D, x: number, y: number, z: number, width: number, height: number, depth: number, material: THREE.Material = this.stone): THREE.Mesh {
    const masonry = (material === this.stone || material === this.light || material === this.dark)
      && Math.min(width, height, depth) > 0.35;
    const geometry = masonry
      ? weatheredBlockGeometry(width, height, depth, Math.round(x * 31 + y * 19 + z * 43))
      : new THREE.BoxGeometry(width, height, depth);
    return this.mesh(parent, geometry, material, x, y, z);
  }

  private collider(x: number, z: number, width: number, depth: number, height: number, yaw = 0): void {
    this.colliders.push({ center: { x, y: height / 2, z }, half: { x: width / 2, y: height / 2, z: depth / 2 }, yaw });
  }

  private site(name: string, x: number, z: number, yaw = 0): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    this.group.add(group);
    return group;
  }

  /** Tapered pylon, characteristic battered walls instead of a rectangular tower. */
  private pylon(parent: THREE.Group, x: number, z: number, height: number): void {
    const geometry = new THREE.CylinderGeometry(1, 1, height, 4, 1);
    geometry.rotateY(Math.PI / 4);
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const taper = positions.getY(i) > 0 ? 0.76 : 1;
      positions.setX(i, positions.getX(i) * 5.2 * taper);
      positions.setZ(i, positions.getZ(i) * 2.8 * taper);
    }
    geometry.computeVertexNormals();
    this.mesh(parent, geometry, this.stone, x, height / 2 + 0.6, z);
    this.box(parent, x, 0.4, z, 7.7, 0.8, 4.5, this.dark);
    this.box(parent, x, height + 0.8, z, 6.2, 0.65, 3.5, this.light);
    this.box(parent, x, height + 0.34, z, 6.4, 0.18, 3.65, this.teal);
    this.relief(parent, x, height * 0.5, z + 2.02, height * 0.3);
  }

  /** Recessed painted cartouche with an ankh and a solar disc. */
  private relief(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1): void {
    const group = new THREE.Group();
    group.position.set(x, y, z);group.scale.setScalar(scale);
    parent.add(group);
    this.box(group, 0, 0, 0, 0.96, 2.25, 0.08, this.dark);
    this.box(group, 0, -0.1, 0.06, 0.12, 1.12, 0.06, this.gold);
    this.box(group, 0, 0.2, 0.065, 0.65, 0.12, 0.06, this.gold);
    const loop = this.mesh(group, new THREE.TorusGeometry(0.22, 0.06, 5, 12), this.gold, 0, 0.53, 0.08);
    loop.scale.y = 1.3;
    for (const side of [-1, 1]) this.box(group, side * 0.42, 0, 0.07, 0.04, 2.1, 0.04, this.teal);
    this.mesh(group, new THREE.CircleGeometry(0.12, 12), this.gold, 0, -0.86, 0.08);
  }

  private column(parent: THREE.Group, x: number, z: number, height: number): void {
    this.box(parent, x, 0.3, z, 2.5, 0.6, 2.5, this.dark);
    const drums = Math.max(3, Math.round(height / 1.3));
    for (let index = 0; index < drums; index++) {
      const drumHeight = height / drums;
      const geometry = columnDrumGeometry(1 - index / drums * 0.25,
        1 - (index + 1) / drums * 0.25, drumHeight - 0.035,
        Math.round(x * 11 + z * 17) + index, height < 5 && index === drums - 1);
      this.mesh(parent, geometry, this.stone, x,
        0.6 + (index + 0.5) * drumHeight, z);
    }
    // Broken columns expose their fracture instead of retaining an intact capital.
    if (height < 5) return;
    // Papyrus capital and glazed collar.
    this.mesh(parent, new THREE.CylinderGeometry(1.3, 0.74, 1, 12), this.light, x, height + 0.6, z);
    this.mesh(parent, new THREE.CylinderGeometry(0.83, 0.83, 0.22, 12), this.teal, x, height + 0.1, z);
    this.box(parent, x, height + 1.25, z, 2.75, 0.45, 2.75, this.light);
    for (const y of [1.05, 1.45]) this.mesh(parent, new THREE.CylinderGeometry(1.01, 1.01, 0.1, 12), this.gold, x, y, z);
  }

  private temple(): void {
    const root = this.site("buried-temple-court", -19, -17);
    this.box(root, 0, 0.12, 0, 31, 0.24, 27, this.dark);
    this.box(root, 0, 0.27, 0, 29, 0.12, 25, this.stone);
    for (const side of [-1, 1]) {
      this.pylon(root, side * 7.2, 10, 10.5);
      this.collider(-19 + side * 7.2, -7, 7.7, 4.5, 12);
      for (let row = 0; row < 3; row++) {
        const height = side === 1 && row === 1 ? 3.7 : 7.6;
        this.column(root, side * 10.5, 3 - row * 6, height);
        this.collider(-19 + side * 10.5, -14 - row * 6, 2.75, 2.75, height + 1.5);
      }
      if (side === -1) {
        this.box(root, side * 10.5, 9.25, -4, 3.2, 1.05, 16.3);
        this.box(root, side * 10.5, 9.63, -4, 3.25, 0.2, 16.4, this.teal);
      } else {
        // The beam above the broken middle column has fallen into the court.
        this.box(root, 10.5, 9.25, 1.1, 3.2, 1.05, 6.2);
        this.box(root, 10.5, 9.63, 1.1, 3.25, 0.2, 6.3, this.teal);
        this.box(root, 10.5, 9.25, -10.5, 3.2, 1.05, 3.2);
        const fallen = this.box(root, 10.2, 0.75, -4.2, 2.8, 1.05, 5.6);
        fallen.rotation.set(0.08, 0.18, 0.06);
      }
    }
    this.box(root, 0, 8.6, 10, 8.6, 1.1, 3.4, this.light);
    this.box(root, 0, 9.23, 10, 8.9, 0.2, 3.6, this.teal);
    const disc = this.mesh(root, new THREE.CircleGeometry(0.9, 24), this.gold, 0, 8.6, 11.73);
    disc.name = "temple-solar-disc";
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) this.box(root, side * (1.3 + i * 0.55), 8.6 - i * 0.12, 11.72, 0.5, 0.38, 0.1, i % 2 ? this.teal : this.gold);
    // Ruined sanctuary with one collapsed wall and an exposed altar.
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 5; column++) {
        if ((column === 4 && row > 0) || (column === 3 && row > 2)) continue;
        const block = this.box(root, (column - 2) * 3,
          0.73 + row * 1.5, -11, 2.94, 1.44, 2.3,
          (row + column) % 4 === 0 ? this.light : this.stone);
        block.rotation.y = Math.sin(row * 5 + column * 3) * 0.012;
      }
    }
    this.collider(-19, -28, 15, 2.3, 6);
    for (const x of [-4.5, 0]) this.relief(root, x, 3.1, -9.8, 1.35);
    this.box(root, 0, 0.8, -3, 5, 1.6, 4, this.light);
    this.box(root, 0, 1.7, -3, 5.4, 0.22, 4.4, this.gold);
    this.collider(-19, -20, 5.4, 4.4, 1.9);
    for (let i = 0; i < 14; i++) {
      const x = 3 + this.random() * 8, z = -7 + this.random() * 13;
      const block = this.box(root, x, 0.5, z, 0.8 + this.random(), 0.6 + this.random(), 1.2, i % 3 ? this.stone : this.light);
      block.rotation.set(this.random() * 0.2, this.random() * 3, this.random() * 0.2);
    }
  }

  private frame(t: number, lateral: number) {
    const i = Math.round(t * this.track.path.length) % this.track.path.length;
    const p = this.track.path[i], yaw = this.track.pathYaw(i);
    return { x: p.x - Math.cos(yaw) * lateral, z: p.z + Math.sin(yaw) * lateral, yaw };
  }

  private processionalWay(): void {
    for (const t of [0.045, 0.073, 0.1, 0.135, 0.46, 0.51, 0.75, 0.83, 0.89, 0.96]) {
      for (const side of [-1, 1]) {
        const p = this.frame(t, side * 13.4);
        if (distanceToRoute(this.track, p.x, p.z) < 12.2) continue;
        const root = this.site("linen-solar-standard", p.x, p.z, p.yaw);
        this.box(root, 0, 0.3, 0, 1.3, 0.6, 1.3, this.dark);
        this.mesh(root, new THREE.CylinderGeometry(0.1, 0.16, 6.3, 7), this.gold, 0, 3.5, 0);
        this.box(root, 0.7, 6.15, 0, 1.7, 0.12, 0.15, this.gold);
        const cloth = new THREE.PlaneGeometry(1.35, 3.1, 8, 12);
        const vertices = cloth.getAttribute("position");
        for (let i = 0; i < vertices.count; i++) {
          const drop = (1.55 - vertices.getY(i)) / 3.1;
          vertices.setZ(i, Math.sin(vertices.getX(i) * 5 + drop * 3) * drop * 0.18);
        }
        cloth.computeVertexNormals();
        const fabric = this.teal;
        fabric.side = THREE.DoubleSide;
        this.mesh(root, cloth, fabric, 0.68, 4.56, 0);
        this.relief(root, 0.68, 4.55, 0.22, 0.72);
        const back = new THREE.Group();
        back.rotation.y = Math.PI;
        root.add(back);
        this.relief(back, -0.68, 4.55, 0.22, 0.72);
        this.collider(p.x, p.z, 1.3, 1.3, 6.6, p.yaw);
      }
    }
  }

  private jar(root: THREE.Group, x: number, z: number, scale: number): void {
    const points = [[0.16,0], [0.42,0.16], [0.58,0.68], [0.47,1.1], [0.24,1.3], [0.24,1.5], [0.31,1.54]].map(([r,y]) => new THREE.Vector2(r * scale,y * scale));
    this.mesh(root, new THREE.LatheGeometry(points, 12), this.clay, x, 0, z);
    this.mesh(root, new THREE.CylinderGeometry(0.31 * scale, 0.31 * scale, 0.1 * scale, 12), this.light, x, 1.5 * scale, z);
    this.mesh(root, new THREE.CylinderGeometry(0.21 * scale, 0.21 * scale, 0.01, 12), this.dark, x, 1.56 * scale, z);
  }

  private roadside(): void {
    for (let i = 0; i < 32; i++) {
      const t = 0.02 + i * 0.03;
      if (t > 0.55 && t < 0.74) continue;
      const p = this.frame(t, (i % 2 ? -1 : 1) * (12 + this.random() * 3));
      if (distanceToRoute(this.track, p.x, p.z) < 11.8) continue;
      const root = this.site("excavated-roadside-stones", p.x, p.z, p.yaw + 0.2);
      for (let j = 0; j < 4; j++) {
        const block = this.box(root, (j - 1.5) * 0.9, 0.25 + (j % 2) * 0.2, this.random() * 1.1, 0.65 + this.random() * 0.3, 0.5 + (j % 2) * 0.4, 0.8, j % 3 ? this.stone : this.light);
        block.rotation.y = this.random() * 1.3;
      }
      if (i % 3 === 0) this.jar(root, 0, -1.1, 0.85);
      if (i % 3 === 0) {
        this.box(root, 0, 1.8, 0, 1.4, 3.6, 0.8);
        this.relief(root, 0, 2.3, 0.43, 0.9);
      }
      this.collider(p.x, p.z, 4.5, 3.8, i % 3 === 0 ? 3.6 : 1.4, p.yaw + 0.2);
    }
  }

  private oasisQuay(): void {
    const root = this.site("oasis-water-stairs", -25, 52);
    for (let step = 0; step < 4; step++) this.box(root, 0, 0.12 + step * 0.12, step * 0.8, 7 - step * 0.35, 0.24, 1.4, this.light);
    for (const side of [-1, 1]) {
      this.column(root, side * 5.3, 3, side === -1 ? 4.3 : 2.6);
      this.jar(root, side * 3.8, 3.1, 1.1);
      this.collider(-25 + side * 5.3, 55, 2.75, 2.75, 5.8);
    }
    const palms = [
      { x: -44, y: 0, z: 49, scale: 1.15, variant: "arching" as const },
      { x: -47, y: 0, z: 36, scale: 0.95, variant: "tall" as const },
      { x: -10, y: 0, z: 54, scale: 1.25, variant: "tall" as const },
      { x: -6, y: 0, z: 48, scale: 0.85, variant: "compact" as const },
      { x: -35, y: 0, z: 59, scale: 0.85, variant: "compact" as const },
      { x: -48, y: 0, z: 59, scale: 1.1, variant: "tall" as const },
    ];
    createPalmBatches(this.group, palms.filter(p => distanceToRoute(this.track, p.x, p.z) > 12));
  }
}
