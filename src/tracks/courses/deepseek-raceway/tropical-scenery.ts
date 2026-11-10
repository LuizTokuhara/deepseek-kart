import * as THREE from "three";
import { inGardenReturn } from "./garden-return";
import { celMaterial, outlinedMaterial } from "../../../rendering/cel-shading";
import { GROUND_Y } from "../../../core/config";
import type { TrackLike } from "../../track";
import type { ColliderBox } from "../../../core/types";
import {
  batch,
  flatMaterial,
  randomGenerator,
  type Placement,
} from "../../../decor/common";
import { createLagoon, type LagoonResult } from "../../../decor/nature/lagoon";
import {
  createGroundPlantBatches,
  createPalmBatches,
} from "../../../decor/nature/palms";
import { createVolcano, type VolcanoResult } from "../../../decor/nature/volcano";
import {
  hillColliders,
  type HillSpot,
} from "../../../decor/nature/hills";

/** Scenery remains outside the racing line and the two runoff corridors. */
export class TropicalScenery {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  private readonly volcano: VolcanoResult;
  private readonly lagoon: LagoonResult;

  constructor(private readonly track: TrackLike) {
    this.group.name = "tropical-park";
    this.addPalmsAndPlants();

    this.lagoon = createLagoon(94, 20);
    this.group.add(this.lagoon.group);
    this.colliders.push(...this.lagoon.colliders);

    this.addBackdrop();
    this.volcano = createVolcano(148, -42);
    this.group.add(this.volcano.group);
    this.colliders.push(...this.volcano.colliders);
    this.addRoadDetails();
    this.addTurnSigns();
  }

  update(dt: number): void {
    this.volcano.update(dt);
    this.lagoon.update(dt);
  }

  private clearOfTrack(x: number, z: number, radius: number): boolean {
    if (Math.abs(x) > 122 || Math.abs(z) > 92 || inGardenReturn(x, z)) return false;
    // LagoonBend owns the first corner composition; avoid random overlaps.
    if (x > 30 && x < 90 && z > -55 && z < -8) return false;
    // Preserve space for the existing grandstands.
    if ((z < -41 && z > -57 && x > -36 && x < 28) ||
        (z > 47 && z < 63 && x > -28 && x < 36)) return false;
    for (let index = 0; index < this.track.path.length; index++) {
      const point = this.track.path[index];
      const next = this.track.path[(index + 1) % this.track.path.length];
      const dx = next.x - point.x;
      const dz = next.z - point.z;
      const along = THREE.MathUtils.clamp(
        ((x - point.x) * dx + (z - point.z) * dz) / (dx * dx + dz * dz), 0, 1,
      );
      const distance = Math.hypot(x - point.x - dx * along, z - point.z - dz * along);
      if (distance < this.track.width / 2 + radius + 1.3) return false;
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

    const addPalm = (x: number, z: number, scale: number): void => {
      // Keep the near bank open, framing the water from the racing camera.
      if (x > 70 && x < 100 && z > 0 && z < 37) return;
      if (!this.clearOfTrack(x, z, 1.1)) return;
      if (palms.some((palm) => Math.hypot(palm.x - x, palm.z - z) < 3.8)) return;
      palms.push({ x, y: 0, z, scale, yaw: random() * Math.PI * 2 });
      this.colliders.push({
        center: { x, y: 2.4, z },
        half: { x: 0.4 * scale, y: 2.4, z: 0.4 * scale }, yaw: 0,
      });
    };

    for (let index = 0; index < this.track.path.length; index += 3) {
      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      for (const side of [-1, 1]) {
        // Uneven groves separated by open stretches, instead of an avenue.
        if (index % 12 === 0) {
          const count = random() > 0.5 ? 3 : 2;
          const distance = 12.5 + random() * 7;
          for (let member = 0; member < count; member++) {
            const offset = side * (distance + (member % 2) * 3.5);
            const along = (member - 1) * 4.5 + (random() - 0.5) * 2;
            const x = point.x + Math.cos(yaw) * offset + Math.sin(yaw) * along;
            const z = point.z - Math.sin(yaw) * offset + Math.cos(yaw) * along;
            addPalm(x, z, 0.8 + random() * 0.5);
          }
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
    // Irregular groups on the far/side banks; no evenly spaced palm ring.
    for (const angle of [-1.9, -1.68, -1.48, -0.7, -0.46, 0.15, 0.4, 0.63, 1.2, 1.44]) {
      const radius = 1 + random() * 0.12;
      addPalm(94 + Math.cos(angle) * 22 * radius,
        20 + Math.sin(angle) * 18.5 * radius, 0.85 + random() * 0.45);
    }
    const patches = plants
      .filter(
        (spot, index) =>
          index % 2 === 0 && this.clearOfTrack(spot.x, spot.z, 3.2),
      )
      .map((spot) => ({ ...spot, y: 0.008, scale: 1.15 }));
    createPalmBatches(this.group, palms);
    createGroundPlantBatches(this.group, plants, rocks, flowers, patches);
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
    batch(this.group, geometry, outlinedMaterial(0x75a469, 0.0008), spots).name = "distant-tropical-hills";
    // The nearest mounds reach inside the map edge, so their feet are solid.
    const hills: HillSpot[] = spots.map((spot) => {
      const scale = spot.scale ?? 1;
      return {
        x: spot.x,
        z: spot.z,
        sx: 19 * scale,
        sy: 12 * scale,
        sz: 21 * scale,
      };
    });
    // Most of each ring lies beyond the map wall; only keep the arc that can
    // ever touch a kart, a projectile or the chase camera.
    const { bounds } = this.track;
    this.colliders.push(
      ...hillColliders(hills).filter((box) => {
        const reach = Math.hypot(box.half.x, box.half.z);
        return (
          box.center.x + reach >= bounds.minX &&
          box.center.x - reach <= bounds.maxX &&
          box.center.z + reach >= bounds.minZ &&
          box.center.z - reach <= bounds.maxZ
        );
      }),
    );
  }



  private addRoadDetails(): void {
    const geometry = new THREE.BoxGeometry(0.11, 0.009, 1);
    const spots: Placement[] = [];
    // Small edge dashes communicate the track direction without obscuring items.
    for (let index = 0; index < this.track.path.length; index++) {
      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      for (const side of [-1, 1]) {
        const offset = side * (this.track.width / 2 - 0.9);
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
      const t = index / this.track.path.length;
      if (t >= 0.50 && t <= 0.94) continue; // GardenReturn owns this sector.
      if (t >= 0.24 && t <= 0.34) continue; // Art-directed LagoonBend signs.
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
