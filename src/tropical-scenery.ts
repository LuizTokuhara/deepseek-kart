import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { celMaterial } from "./cel-shading";
import { GROUND_Y, TRACK } from "./config";
import type { Track } from "./track";
import type { ColliderBox } from "./types";

interface Placement {
  x: number;
  y: number;
  z: number;
  scale?: number;
  yaw?: number;
}

function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function batch(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: Placement[],
  shadows = false,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const dummy = new THREE.Object3D();
  placements.forEach((spot, index) => {
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.rotation.set(0, spot.yaw ?? 0, 0);
    dummy.scale.setScalar(spot.scale ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  parent.add(mesh);
  return mesh;
}

/** Folded, serrated fronds also work at the smaller scale of ground plants. */
function fronds(count: number, length: number, height: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const rows = 10;
  for (let leaf = 0; leaf < count; leaf++) {
    const angle = leaf / count * Math.PI * 2;
    const base = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const reach = t * length;
      const y = height + Math.sin(t * Math.PI) * length * 0.25 - t * t * length * 0.27;
      const width = Math.sin(t * Math.PI) ** 0.7 * length * 0.16 * (row % 2 ? 0.78 : 1);
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
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function flatMaterial(color: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color });
  material.userData.outlineParameters = { visible: false };
  return material;
}

/** Scenery remains outside the racing line and the two runoff corridors. */
export class TropicalScenery {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  private readonly smoke: THREE.InstancedMesh;
  private readonly rippleMaterial = flatMaterial(0x91e5dc);
  private readonly smokeDummy = new THREE.Object3D();
  private elapsed = 0;

  constructor(private readonly track: Track) {
    this.group.name = "tropical-park";
    this.addPalmsAndPlants();
    this.addLagoon();
    this.addBackdrop();
    this.smoke = this.addVolcano();
    this.addRoadDetails();
    this.addTurnSigns();
  }

  update(dt: number): void {
    this.elapsed += dt;
    for (let index = 0; index < 7; index++) {
      const phase = (index / 7 + this.elapsed * 0.028) % 1;
      this.smokeDummy.position.set(
        148 + Math.sin(index * 2.1 + phase) * 2 + phase * 9,
        48 + phase * 26,
        -42 + phase * 5,
      );
      this.smokeDummy.scale.setScalar(1.8 + phase * 3.3);
      this.smokeDummy.rotation.set(0, phase, phase * 0.3);
      this.smokeDummy.updateMatrix();
      this.smoke.setMatrixAt(index, this.smokeDummy.matrix);
    }
    this.smoke.instanceMatrix.needsUpdate = true;
    this.rippleMaterial.opacity = 0.36 + Math.sin(this.elapsed * 1.4) * 0.12;
  }

  private clearOfTrack(x: number, z: number, radius: number): boolean {
    if (Math.abs(x) > 122 || Math.abs(z) > 92) return false;
    // Preserve space for the existing grandstands.
    if ((z < -41 && z > -57 && x > -36 && x < 28) ||
        (z > 41 && z < 57 && x > -28 && x < 36)) return false;
    for (let index = 0; index < this.track.path.length; index++) {
      const point = this.track.path[index];
      const next = this.track.path[(index + 1) % this.track.path.length];
      const dx = next.x - point.x;
      const dz = next.z - point.z;
      const along = THREE.MathUtils.clamp(
        ((x - point.x) * dx + (z - point.z) * dz) / (dx * dx + dz * dz), 0, 1,
      );
      const distance = Math.hypot(x - point.x - dx * along, z - point.z - dz * along);
      if (distance < TRACK.width / 2 + radius + 1.3) return false;
      const t = index / this.track.path.length;
      if (((t > 0.28 && t < 0.38) || (t > 0.66 && t < 0.755)) && distance < 16) return false;
    }
    return true;
  }

  private addPalmsAndPlants(): void {
    const random = randomGenerator(8128);
    const palms: Placement[] = [];
    const plants: Placement[] = [];
    const rocks: Placement[] = [];
    const flowers: Placement[] = [];
    const trunk = new THREE.CylinderGeometry(0.19, 0.31, 6, 7, 10);
    const position = trunk.getAttribute("position");
    const colors: number[] = [];
    const color = new THREE.Color();
    for (let index = 0; index < position.count; index++) {
      const y = position.getY(index) + 3;
      position.setXYZ(index,
        position.getX(index) + 0.55 * (y / 6) ** 2,
        y,
        position.getZ(index) + 0.15 * (y / 6) ** 2);
      color.setHex(Math.round(y / 0.6) % 2 ? 0xb7803a : 0xd3a052);
      colors.push(color.r, color.g, color.b);
    }
    trunk.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    trunk.computeVertexNormals();
    const trunkMaterial = celMaterial(0xffffff);
    trunkMaterial.vertexColors = true;

    for (let index = 0; index < this.track.path.length; index += 3) {
      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      for (const side of [-1, 1]) {
        const offset = side * (10.5 + random() * 4.5);
        let x = point.x + Math.cos(yaw) * offset;
        let z = point.z - Math.sin(yaw) * offset;
        if (index % 6 === 0 && !this.clearOfTrack(x, z, 1.1)) {
          const fallbackOffset = side * (19 + random() * 4);
          x = point.x + Math.cos(yaw) * fallbackOffset;
          z = point.z - Math.sin(yaw) * fallbackOffset;
        }
        if (index % 6 === 0 && this.clearOfTrack(x, z, 1.1)) {
          const scale = 0.8 + random() * 0.55;
          palms.push({ x, y: 0, z, scale, yaw: random() * Math.PI * 2 });
          this.colliders.push({
            center: { x, y: 2.4, z }, half: { x: 0.4 * scale, y: 2.4, z: 0.4 * scale }, yaw: 0,
          });
        }
        for (let clump = 0; clump < 3; clump++) {
          const plantOffset = side * (8.5 + random() * 5);
          const px = point.x + Math.cos(yaw) * plantOffset + (random() - 0.5) * 3;
          const pz = point.z - Math.sin(yaw) * plantOffset + (random() - 0.5) * 3;
          if (!this.clearOfTrack(px, pz, 0.35)) continue;
          const spot = { x: px, y: 0.025, z: pz, scale: 0.6 + random(), yaw: random() * Math.PI * 2 };
          plants.push(spot);
          if (random() > 0.8) flowers.push({ ...spot, y: 0.45, scale: 0.12 + random() * 0.12 });
          if (random() > 0.83) rocks.push({ ...spot, scale: 0.25 + random() * 0.45 });
        }
      }
    }
    for (let index = 0; index < 12; index++) {
      const angle = index / 12 * Math.PI * 2;
      const x = 94 + Math.cos(angle) * 22;
      const z = 20 + Math.sin(angle) * 18.5;
      if (!this.clearOfTrack(x, z, 1.1)) continue;
      const scale = 0.9 + random() * 0.35;
      palms.push({ x, y: 0, z, scale, yaw: random() * Math.PI * 2 });
      this.colliders.push({ center: { x, y: 2.4, z },
        half: { x: 0.4 * scale, y: 2.4, z: 0.4 * scale }, yaw: 0 });
    }
    batch(this.group, trunk, trunkMaterial, palms, true).name = "palm-trunks";
    const leaves = fronds(8, 3.4, 6);
    leaves.translate(0.55, 0, 0.15);
    const leafMaterial = celMaterial(0x3f934a);
    leafMaterial.side = THREE.DoubleSide;
    batch(this.group, leaves, leafMaterial, palms, true).name = "palm-fronds";
    const nuts: THREE.BufferGeometry[] = [];
    for (let index = 0; index < 3; index++) {
      const geometry = new THREE.IcosahedronGeometry(0.22, 1);
      geometry.translate(0.55 + Math.sin(index * 2.1) * 0.25, 5.8, 0.15 + Math.cos(index * 2.1) * 0.25);
      nuts.push(geometry);
    }
    const coconuts = mergeGeometries(nuts, false)!;
    nuts.forEach(geometry => geometry.dispose());
    batch(this.group, coconuts, celMaterial(0xdab04f), palms);
    const patch = new THREE.CircleGeometry(1, 7);
    patch.rotateX(-Math.PI / 2);
    patch.scale(2.4, 1, 1.4);
    batch(this.group, patch, celMaterial(0x8fba5a), plants
      .filter((spot, index) => index % 2 === 0 && this.clearOfTrack(spot.x, spot.z, 3.2))
      .map(spot => ({ ...spot, y: 0.008, scale: 1.15 })));
    const plantMaterial = celMaterial(0x327d48);
    plantMaterial.side = THREE.DoubleSide;
    batch(this.group, fronds(5, 0.7, 0.3), plantMaterial, plants, true).name = "tropical-ground-plants";
    batch(this.group, new THREE.DodecahedronGeometry(1, 0), celMaterial(0xb3aa87), rocks);
    batch(this.group, new THREE.IcosahedronGeometry(1, 0), celMaterial(0xef8b65), flowers);
  }

  private addLagoon(): void {
    const lagoon = new THREE.Group();
    lagoon.name = "lagoon";
    lagoon.position.set(94, 0, 20);
    this.group.add(lagoon);
    const shore = new THREE.Mesh(new THREE.CircleGeometry(1, 48), celMaterial(0xe5ce91));
    shore.rotation.x = -Math.PI / 2;
    shore.position.y = 0.012;
    shore.scale.set(19.4, 15.3, 1);
    shore.receiveShadow = true;
    lagoon.add(shore);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), flatMaterial(0x399fae));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.023;
    water.scale.set(17.8, 13.7, 1);
    lagoon.add(water);
    const stones: Placement[] = [];
    for (let index = 0; index < 44; index++) {
      const angle = index / 44 * Math.PI * 2;
      const x = Math.cos(angle) * 19.2;
      const z = Math.sin(angle) * 15.1;
      const scale = 1.15 + Math.sin(index * 5.3) * 0.25;
      stones.push({ x, y: 0.25, z, scale, yaw: angle });
      // The visible rocky shore also keeps karts out of the decorative water.
      this.colliders.push({
        center: { x: x + 94, y: 0.5, z: z + 20 },
        half: { x: 1.55 * scale, y: 0.5, z: 1.1 * scale }, yaw: angle,
      });
    }
    const stoneGeometry = new THREE.DodecahedronGeometry(1, 0);
    stoneGeometry.scale(1.6, 0.7, 1.1);
    batch(lagoon, stoneGeometry, celMaterial(0xa8a78d), stones, true);
    this.rippleMaterial.transparent = true;
    this.rippleMaterial.opacity = 0.4;
    this.rippleMaterial.depthWrite = false;
    const ripples: Placement[] = [];
    for (let index = 0; index < 26; index++) {
      const angle = index * 2.4;
      const radius = Math.sqrt(index / 26) * 10;
      ripples.push({ x: Math.cos(angle) * radius * 1.4, y: 0.035,
        z: Math.sin(angle) * radius, scale: 0.7 + (index % 3) * 0.5 });
    }
    batch(lagoon, new THREE.BoxGeometry(1.8, 0.008, 0.08), this.rippleMaterial, ripples);
  }

  private addBackdrop(): void {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    geometry.scale(19, 12, 21);
    const spots: Placement[] = [];
    for (const x of [-145, 145]) {
      for (const z of [-76, -20, 40, 88]) spots.push({ x, y: 0, z, scale: 0.8 + Math.abs(z) / 160 });
    }
    for (const z of [-119, 119]) {
      for (const x of [-95, -42, 16, 74, 122]) spots.push({ x, y: 0, z, scale: 1 + Math.abs(x) / 220 });
    }
    batch(this.group, geometry, celMaterial(0x75a469), spots).name = "distant-tropical-hills";
  }

  private addVolcano(): THREE.InstancedMesh {
    const volcano = new THREE.Group();
    volcano.name = "volcano";
    volcano.position.set(148, 0, -42);
    this.group.add(volcano);
    const radiusAt = (y: number, angle: number): number =>
      (32 - y / 46 * 27) * (1 + 0.08 * Math.sin(angle * 3) + 0.05 * Math.sin(angle * 7 + y * 0.1));
    const geometry = new THREE.CylinderGeometry(5, 32, 46, 18, 8, true);
    const position = geometry.getAttribute("position");
    for (let index = 0; index < position.count; index++) {
      const y = position.getY(index) + 23;
      const angle = Math.atan2(position.getZ(index), position.getX(index));
      const radius = radiusAt(y, angle);
      position.setXYZ(index, Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    }
    geometry.computeVertexNormals();
    const faceted = geometry.toNonIndexed();
    faceted.computeVertexNormals();
    geometry.dispose();
    const rockColors: number[] = [];
    const rockPosition = faceted.getAttribute("position");
    const rockColor = new THREE.Color();
    const palette = [0x81888b, 0x707b83, 0x91938a, 0x747a81];
    for (let face = 0; face < rockPosition.count; face += 3) {
      const angle = Math.atan2(rockPosition.getZ(face), rockPosition.getX(face));
      const sector = Math.floor((angle + Math.PI) / (Math.PI * 2) * 18);
      rockColor.setHex(palette[sector % palette.length]);
      for (let vertex = 0; vertex < 3; vertex++) rockColors.push(rockColor.r, rockColor.g, rockColor.b);
    }
    faceted.setAttribute("color", new THREE.Float32BufferAttribute(rockColors, 3));
    const rockMaterial = celMaterial(0xffffff);
    rockMaterial.vertexColors = true;
    volcano.add(new THREE.Mesh(faceted, rockMaterial));
    const crater = new THREE.Mesh(new THREE.CircleGeometry(5.1, 18), flatMaterial(0x492c29));
    crater.rotation.x = -Math.PI / 2;
    crater.position.y = 45.8;
    volcano.add(crater);
    const lavaPool = new THREE.Mesh(new THREE.CircleGeometry(3.5, 18), flatMaterial(0xffa63b));
    lavaPool.rotation.x = -Math.PI / 2;
    lavaPool.position.y = 45.83;
    volcano.add(lavaPool);
    const positions: number[] = [];
    const indices: number[] = [];
    for (let row = 0; row <= 32; row++) {
      const y = 3 + row / 32 * 43;
      const angle = Math.PI + Math.sin(y * 0.17) * 0.045;
      const halfWidth = 1.2 + (1 - y / 46) * 1.3;
      for (const side of [-1, 1]) {
        const a = angle + side * halfWidth / radiusAt(y, angle);
        const radius = radiusAt(y, a) + 0.4;
        positions.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
      }
      if (row < 32) {
        const a = row * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const lavaGeometry = new THREE.BufferGeometry();
    lavaGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    lavaGeometry.setIndex(indices);
    lavaGeometry.computeVertexNormals();
    const lavaMaterial = flatMaterial(0xffa02e);
    lavaMaterial.side = THREE.DoubleSide;
    volcano.add(new THREE.Mesh(lavaGeometry, lavaMaterial));
    const smoke = batch(this.group, new THREE.IcosahedronGeometry(1, 1), celMaterial(0xb1a49f),
      Array.from({ length: 7 }, (_, index) => ({ x: 148, y: 48 + index * 4, z: -42, scale: 2 + index * 0.5 })));
    // This small animated batch changes position every frame.
    smoke.frustumCulled = false;
    return smoke;
  }

  private addRoadDetails(): void {
    const geometry = new THREE.BoxGeometry(0.11, 0.009, 1);
    const spots: Placement[] = [];
    // Small edge dashes communicate the track direction without obscuring items.
    for (let index = 0; index < this.track.path.length; index++) {
      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      for (const side of [-1, 1]) {
        const offset = side * (TRACK.width / 2 - 0.9);
        spots.push({ x: point.x + Math.cos(yaw) * offset, y: GROUND_Y + 0.014,
          z: point.z - Math.sin(yaw) * offset, yaw });
      }
    }
    batch(this.group, geometry, flatMaterial(0xf4ead1), spots).name = "road-edge-markings";
    const random = randomGenerator(910);
    const flecks: Placement[] = [];
    const skids: Placement[] = [];
    for (let index = 0; index < this.track.path.length; index++) {
      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      for (let chip = 0; chip < 4; chip++) {
        const lateral = (random() - 0.5) * 9.4;
        flecks.push({ x: point.x + Math.cos(yaw) * lateral + (random() - 0.5) * 2,
          y: GROUND_Y + 0.012, z: point.z - Math.sin(yaw) * lateral + (random() - 0.5) * 2,
          scale: 0.03 + random() * 0.045, yaw: random() * Math.PI });
      }
      if (Math.abs(this.track.pathYawDelta(index, 2)) > 0.12) {
        for (const offset of [1.6, 2.1]) {
          skids.push({ x: point.x + Math.cos(yaw) * offset, y: GROUND_Y + 0.013,
            z: point.z - Math.sin(yaw) * offset, yaw });
        }
      }
    }
    const chipGeometry = new THREE.CircleGeometry(1, 3);
    chipGeometry.rotateX(-Math.PI / 2);
    batch(this.group, chipGeometry, flatMaterial(0xcba36f), flecks);
    const skidMaterial = flatMaterial(0x9c7d54);
    skidMaterial.transparent = true;
    skidMaterial.opacity = 0.22;
    skidMaterial.depthWrite = false;
    batch(this.group, new THREE.BoxGeometry(0.055, 0.008, 2.2), skidMaterial, skids);
    const grid = new THREE.Group();
    grid.position.set(this.track.spawn.pos.x, GROUND_Y + 0.02, this.track.spawn.pos.z);
    grid.rotation.y = this.track.spawn.yaw;
    this.group.add(grid);
    const material = flatMaterial(0xf5ebd3);
    for (let row = 0; row < 3; row++) {
      for (const side of [-1, 1]) {
        const mark = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.012, 0.09), material);
        mark.position.set(side * 2.2, 0, -2 - row * 3.2);
        grid.add(mark);
        for (const edge of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.8), material);
          leg.position.set(side * 2.2 + edge * 0.605, 0, -2.35 - row * 3.2);
          grid.add(leg);
        }
      }
    }
  }

  private addTurnSigns(): void {
    const backing = celMaterial(0x243b3b);
    const yellow = flatMaterial(0xf5d26b);
    const arrowGeometry = new THREE.BufferGeometry();
    arrowGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.22, -0.32, 0, 0.08, -0.32, 0, 0.38, 0, 0,
      -0.22, -0.32, 0, 0.38, 0, 0, 0.08, 0, 0,
      0.08, 0, 0, 0.38, 0, 0, 0.08, 0.32, 0,
      0.08, 0, 0, 0.08, 0.32, 0, -0.22, 0.32, 0,
    ], 3));
    arrowGeometry.computeVertexNormals();
    for (let index = 3; index < this.track.path.length; index += 5) {
      const turn = this.track.pathYawDelta(index, 3);
      if (Math.abs(turn) < 0.2) continue;
      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      // Positive yaw turns left; place warnings along the outside of the bend.
      const outside = turn > 0 ? 1 : -1;
      const sign = new THREE.Group();
      sign.position.set(point.x + Math.cos(yaw) * outside * 7.3, 1.7,
        point.z - Math.sin(yaw) * outside * 7.3);
      sign.rotation.y = yaw + Math.PI;
      this.group.add(sign);
      sign.add(new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.0, 0.12), backing));
      for (let arrow = 0; arrow < 3; arrow++) {
        const mesh = new THREE.Mesh(arrowGeometry, yellow);
        mesh.position.set((arrow - 1) * 0.57, 0, 0.065);
        mesh.scale.x = -Math.sign(turn);
        // Flipping a chevron reverses its winding, so both faces are visible.
        yellow.side = THREE.DoubleSide;
        sign.add(mesh);
      }
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.25, 0.1), backing);
      pole.position.y = -1;
      sign.add(pole);
    }
  }
}
