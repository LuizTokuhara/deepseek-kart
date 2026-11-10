import * as THREE from "three";
import { celMaterial } from "../../../rendering/cel-shading";
import { randomGenerator } from "../../../decor/common";

/** Hand-drawn shores; the north channel ends at the two edges of the track. */
export const LAKE_SHORE: readonly (readonly [number, number])[] = [
  [-54, -31], [-43, -39], [-48, -51], [-25, -46], [-18, -58],
  [-10, -54], [-10, -67], [8, -67], [11, -53], [24, -48],
  [38, -52], [44, -39], [54, -32], [47, -20], [65, -17],
  [66, -7], [49, -2], [56, 16], [44, 23], [49, 39],
  [31, 35], [22, 51], [12, 43], [1, 55], [-8, 42],
  [-27, 49], [-23, 34], [-43, 39], [-38, 24], [-57, 20],
  [-48, 4], [-58, -5], [-44, -15],
];
const NORTH_CHANNEL: readonly (readonly [number, number])[] = [
  [-10, -90], [7, -90], [11, -110], [7, -147],
  [-10, -147], [-15, -121],
];

export function insideLake(x: number, z: number): boolean {
  return [LAKE_SHORE, NORTH_CHANNEL].some((polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [ax, az] = polygon[i], [bx, bz] = polygon[j];
      if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
    }
    return inside;
  });
}

function shapeOf(points: readonly (readonly [number, number])[]): THREE.Shape {
  return new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
}

/** Water, ice floes, and geysers stay outside the racing surface. */
export class LakeScenery {
  readonly group = new THREE.Group();
  private time = 0;
  private readonly jets: Array<{ group: THREE.Group; drops: THREE.Mesh[]; phase: number }> = [];
  private readonly floes: THREE.Group[] = [];
  /** Shared by every jet, foam ring and droplet. */
  private readonly geyserMaterial = Object.assign(celMaterial(0xc6f5ff), {
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });

  constructor() {
    this.group.name = "vanilla-central-lake";
    const water = celMaterial(0x22659b);
    const shoreMaterial = celMaterial(0xcceef6);
    shoreMaterial.userData.outlineParameters = { visible: false };
    for (const polygon of [LAKE_SHORE, NORTH_CHANNEL]) {
      const centerX = polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length;
      const centerZ = polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length;
      const ring = shapeOf(polygon.map(([x, z]) => [centerX + (x - centerX) * 1.025, centerZ + (z - centerZ) * 1.025]));
      ring.holes.push(new THREE.Path(shapeOf(polygon).getPoints()));
      const shoreGeometry = new THREE.ShapeGeometry(ring);
      shoreGeometry.rotateX(-Math.PI / 2);
      const shore = new THREE.Mesh(shoreGeometry, shoreMaterial);
      shore.position.y = 0.12;
      this.group.add(shore);
      const geometry = new THREE.ShapeGeometry(shapeOf(polygon));
      geometry.rotateX(-Math.PI / 2);
      const surface = new THREE.Mesh(geometry, water);
      surface.position.y = 0.12;
      this.group.add(surface);
    }
    this.addFloes();
    this.addShoreChunks();
    this.addRipples();
    for (const [x, z] of [[-33, -25], [21, -29], [37, 14], [-29, 22], [0, -112]]) {
      this.addGeyser(x, z, this.jets.length * 1.7);
    }
  }

  update(dt: number): void {
    this.time += Math.min(dt, 0.05);
    for (let i = 0; i < this.floes.length; i++) {
      this.floes[i].position.y = 0.14 + Math.sin(this.time * 0.65 + i * 1.8) * 0.055;
    }
    for (const jet of this.jets) {
      const pulse = 0.35 + Math.max(0, Math.sin(this.time * 0.8 + jet.phase)) * 0.65;
      jet.group.scale.y = pulse;
      jet.drops.forEach((drop, index) => {
        const age = (this.time * 0.65 + index / jet.drops.length) % 1;
        const angle = index * 2.399;
        const radius = 0.25 + age * 1.8;
        drop.position.set(Math.cos(angle) * radius, 0.3 + Math.sin(age * Math.PI) * 6.5, Math.sin(angle) * radius);
        drop.scale.setScalar(0.07 + (1 - age) * 0.13);
      });
    }
  }

  private addFloes(): void {
    const random = randomGenerator(6021);
    const top = celMaterial(0xf1fcff);
    const side = celMaterial(0x8acfe5);
    for (let i = 0; i < 28; i++) {
      let x = 0, z = 0;
      for (let attempt = 0; attempt < 40; attempt++) {
        x = (random() - 0.5) * 89;
        z = (random() - 0.5) * 82;
        if (insideLake(x, z)) break;
      }
      const shape = shapeOf([[-1, -0.4], [-0.35, -0.95], [0.7, -0.6], [1, 0.3], [0.05, 0.9], [-0.8, 0.55]]);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.25, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.08, bevelSegments: 1, steps: 1,
      });
      geometry.rotateX(-Math.PI / 2);
      const floe = new THREE.Mesh(geometry, [top, side]);
      const group = new THREE.Group();
      group.name = "floating-ice";
      group.position.set(x, 0.14, z);
      group.rotation.y = random() * Math.PI * 2;
      floe.scale.set(1.8 + random() * 2.8, 1, 1.6 + random() * 3.5);
      floe.castShadow = true;
      group.add(floe);
      this.group.add(group);
      this.floes.push(group);
    }
  }

  private addShoreChunks(): void {
    const geometry = new THREE.DodecahedronGeometry(1, 0);
    const material = celMaterial(0xe6f8ff);
    const count = LAKE_SHORE.length * 2;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = "broken-lake-shore";
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = LAKE_SHORE[Math.floor(i / 2)];
      const b = LAKE_SHORE[(Math.floor(i / 2) + 1) % LAKE_SHORE.length];
      const f = i % 2 ? 0.55 : 0.12;
      dummy.position.set(a[0] + (b[0] - a[0]) * f, 0.17, a[1] + (b[1] - a[1]) * f);
      dummy.rotation.set(0, i * 1.3, 0);
      dummy.scale.set(1.2 + i % 3 * 0.3, 0.3, 0.8);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private addRipples(): void {
    const material = new THREE.MeshBasicMaterial({ color: 0x7bc8df, transparent: true, opacity: 0.35, depthWrite: false });
    material.userData.outlineParameters = { visible: false };
    for (let i = 0; i < 13; i++) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(2.7, 2.77, 32, 1, 0.2, 2.4), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = i * 1.2;
      mesh.position.set(Math.sin(i * 2.4) * 36, 0.14, Math.cos(i * 2.4) * 29);
      mesh.scale.set(1.5, 0.55, 1);
      this.group.add(mesh);
    }
  }

  private addGeyser(x: number, z: number, phase: number): void {
    const group = new THREE.Group();
    group.name = "lake-geyser";
    group.position.set(x, 0.12, z);
    this.group.add(group);
    const material = this.geyserMaterial;
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.45, 4.8, 7), material);
    jet.position.y = 2.4;
    group.add(jet);
    const foam = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.12, 5, 18), material);
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = 0.08;
    group.add(foam);
    const drops: THREE.Mesh[] = [];
    const dropGeometry = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 14; i++) {
      const drop = new THREE.Mesh(dropGeometry, material);
      group.add(drop);
      drops.push(drop);
    }
    this.jets.push({ group, drops, phase });
  }
}
