import * as THREE from "three";
import { PenguinCrossing } from "./penguin-crossing";
import { BreakableIce } from "./breakable-ice";
import { LakeScenery, insideLake } from "./lake-scenery";
import { vanillaLakeLayout } from "./layout";
import { createPenguin } from "../../../decor/props/ice-props";
import { randomGenerator } from "../../../decor/common";
import { createBackdrop } from "../../../decor/nature/backdrop";
import { createGroundCover } from "../../../decor/nature/ground-cover";
import {
  buildClouds,
  buildHills,
  buildIceBlocks,
  buildIceCrystals,
  buildSnowDrifts,
  buildSnowPines,
  buildSnowmen,
  createFrozenPond,
  createTracksideBoard,
  RaceDecor,
  signMaterial,
  type Decoration,
  type IceBlockSpot,
  type IceCrystalSpot,
  type SnowPineSpot,
  type SnowmanSpot,
} from "../../../decor";
import type { ColliderBox } from "../../../core/types";
import type { TrackLike } from "../../track";

/**
 * Cenário da volta ampliada: lago recortado, gêiseres, colônia de pinguins,
 * bosques nevados, cristais e marcos dos setores. Mantém o corredor livre.
 */
export class VanillaLakeDecor implements Decoration {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  private readonly raceDecor: RaceDecor;
  private readonly lake = new LakeScenery();
  private readonly crossings: PenguinCrossing;
  private readonly breakableIce: BreakableIce;

  constructor(private readonly track: TrackLike) {
    this.group.name = "vanilla-lake-scenery";
    this.crossings = new PenguinCrossing(track);
    this.group.add(this.crossings.group);
    this.colliders.push(...this.crossings.colliders);
    this.breakableIce = new BreakableIce(track);
    this.group.add(this.breakableIce.group);
    this.colliders.push(...this.breakableIce.colliders);
    this.group.add(
      createBackdrop(
        track.bounds.maxX - track.bounds.minX,
        track.bounds.maxZ - track.bounds.minZ,
        // Azul-glaciar escuro: mantém a silhueta das montanhas dentro da neblina.
        0x6f9fc2,
      ),
    );

    this.raceDecor = new RaceDecor(track, {
      banner: "VANILLA LAKE",
      theme: "ice",
      lineColor: 0xf7fdff,
      curbColors: [0x4c9ec6, 0xf5fdff],
      curbExclusions: vanillaLakeLayout.features!.ramps!.map((ramp) => ({
        from: ramp.t - 0.018, to: ramp.t + 0.035,
      })),
    });
    this.group.add(this.raceDecor.group);
    this.colliders.push(...this.raceDecor.colliders);

    this.group.add(this.lake.group);
    this.addPond();
    this.addPenguins();
    this.addPines();
    this.addSnowmen();
    this.addIceBlocks();
    this.addCrystals();
    this.addSnowDrifts();
    this.addHills();
    this.addClouds();
    this.addBoards();
    // Capim seco furando a neve e pedras, longe do lago e dos lagos congelados.
    this.group.add(createGroundCover(track, {
      seed: 7310,
      grass: { base: 0xe4eef3, tip: 0xbcb184, spacing: 1.4, density: 0.45 },
      pebbles: { color: 0xa9b7c3, spacing: 5 },
      avoid: this.colliders,
      flatRoot: this.group,
      exclude: insideLake,
    }));
  }

  get movingObstacles() {
    return this.crossings.movingObstacles;
  }

  fixedUpdate(dt: number): void {
    this.crossings.fixedUpdate(dt);
    this.breakableIce.fixedUpdate(dt);
  }

  reset(): void {
    this.crossings.reset();
    this.breakableIce.reset();
  }

  update(dt: number): void {
    this.lake.update(dt);
  }

  setStartLights(label: string | null): void {
    this.raceDecor.setStartLights(label);
  }

  private addPond(): void {
    for (const pool of [
      { x: -106, z: 84, radiusX: 10, radiusZ: 14 },
      { x: 48, z: 108, radiusX: 9, radiusZ: 7 },
    ]) this.group.add(createFrozenPond(pool));
  }

  private addPenguins(): void {
    for (const [x, z, scale, yaw] of [
      [91, -59, 1.6, -1.3], [95, -57, 1.2, -1.6], [93, -53, 1.3, -1.4],
      [57, -34, 1.5, 1.2], [59, -37, 1.1, 1.4], [54, -36, 1.2, 1.1],
    ]) {
      if (this.nearRoad(x, z, this.track.wallOffset + 1.5) || insideLake(x, z)) continue;
      const penguin = createPenguin();
      penguin.position.set(x, 0, z);
      penguin.rotation.y = yaw;
      penguin.scale.setScalar(scale);
      this.group.add(penguin);
    }
  }

  private addPines(): void {
    const random = randomGenerator(8814);
    const spots: SnowPineSpot[] = [];

    const addTree = (x: number, z: number): void => {
      if (
        x < this.track.bounds.minX + 5 ||
        x > this.track.bounds.maxX - 5 ||
        z < this.track.bounds.minZ + 5 ||
        z > this.track.bounds.maxZ - 5
      ) {
        return;
      }
      if (this.nearRoad(x, z, this.track.wallOffset + 1.2)) {
        return;
      }
      if (spots.some((tree) => Math.hypot(tree.x - x, tree.z - z) < 4.2)) {
        return;
      }
      if (insideLake(x, z) || Math.hypot((x + 106) / 12, (z - 84) / 16) < 1 || Math.hypot((x - 48) / 11, (z - 108) / 9) < 1) {
        return;
      }
      const scale = 0.78 + random() * 0.7;
      spots.push({
        x,
        z,
        scale,
        rotation: random() * Math.PI * 2,
      });
      this.colliders.push({
        center: { x, y: 1.15 * scale, z },
        half: { x: 0.34 * scale, y: 1.15 * scale, z: 0.34 * scale },
        yaw: 0,
      });
    };

    for (let index = 0; index < this.track.path.length; index += 8) {
      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      const outwardX = Math.cos(yaw);
      const outwardZ = -Math.sin(yaw);
      const offset = this.track.wallOffset + 3.2 + random() * 7;
      addTree(
        point.x + outwardX * offset + Math.sin(yaw) * (random() - 0.5) * 5,
        point.z + outwardZ * offset + Math.cos(yaw) * (random() - 0.5) * 5,
      );
      if (index % 16 === 0) {
        const inner = this.track.wallOffset + 6 + random() * 6;
        addTree(
          point.x - outwardX * inner,
          point.z - outwardZ * inner,
        );
      }
    }

    // Bosque de fundo, longe de qualquer trecho da pista.
    for (let index = 0; index < 44; index++) {
      const angle = (index / 44) * Math.PI * 2;
      addTree(
        Math.cos(angle) * (115 + random() * 24),
        Math.sin(angle) * (113 + random() * 24),
      );
    }

    buildSnowPines(spots, this.group);
  }

  private addSnowmen(): void {
    const spots: SnowmanSpot[] = [];
    for (const t of [0.025, 0.10, 0.19, 0.30, 0.40, 0.47, 0.57, 0.64, 0.74, 0.85, 0.94]) {
      const index = Math.round(t * this.track.path.length) % this.track.path.length;
      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      const x = point.x + Math.cos(yaw) * (this.track.wallOffset + 5);
      const z = point.z - Math.sin(yaw) * (this.track.wallOffset + 5);
      if (insideLake(x, z) || this.nearRoad(x, z, this.track.wallOffset + 2)) continue;
      spots.push({ x, z, scale: 1.05 + t * 0.35, rotation: yaw - Math.PI / 2 });
    }
    buildSnowmen(spots, this.group);
    for (const spot of spots) {
      this.colliders.push({
        center: { x: spot.x, y: 1.25 * spot.scale, z: spot.z },
        half: { x: 0.75 * spot.scale, y: 1.25 * spot.scale, z: 0.75 * spot.scale },
        yaw: 0,
      });
    }
  }

  private addIceBlocks(): void {
    const random = randomGenerator(2277);
    const spots: IceBlockSpot[] = [];
    for (const t of [0.08, 0.18, 0.34, 0.46, 0.58, 0.66, 0.73, 0.80, 0.93]) {
      const index = Math.round(t * this.track.path.length) % this.track.path.length;
      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      const outwardX = Math.cos(yaw);
      const outwardZ = -Math.sin(yaw);
      const offset = this.track.wallOffset + 3.4 + random() * 1.8;
      const spot: IceBlockSpot = {
        x: point.x + outwardX * offset,
        z: point.z + outwardZ * offset,
        scale: 0.85 + random() * 0.55,
        rotation: yaw + random() * 0.5,
      };
      if (insideLake(spot.x, spot.z) || this.nearRoad(spot.x, spot.z, this.track.wallOffset + 2)) continue;
      spots.push(spot);
      this.colliders.push({
        center: { x: spot.x, y: 1.05 * spot.scale, z: spot.z },
        half: { x: 1.15 * spot.scale, y: 1.05 * spot.scale, z: 1.15 * spot.scale },
        yaw: spot.rotation,
      });
    }
    buildIceBlocks(spots, this.group);
  }

  private addCrystals(): void {
    const spots: IceCrystalSpot[] = [
      { x: -62, z: -17, scale: 2.2, rotation: 0.2 },
      { x: 41, z: 54, scale: 2.4, rotation: 1.8 },
      { x: -43, z: 105, scale: 2.8, rotation: 0.7 },
      { x: 60, z: -91, scale: 2.5, rotation: 2.1 },
      { x: -109, z: -40, scale: 2.7, rotation: 1.1 },
      { x: 102, z: 23, scale: 2.3, rotation: 0.3 },
      { x: -30, z: -96, scale: 1.8, rotation: 1.6 },
    ].filter((spot) => !insideLake(spot.x, spot.z) && !this.nearRoad(spot.x, spot.z, this.track.wallOffset + 3));
    buildIceCrystals(spots, this.group);
    for (const spot of spots) {
      this.colliders.push({
        center: { x: spot.x, y: 0.7 * spot.scale, z: spot.z },
        half: { x: 0.65 * spot.scale, y: 0.7 * spot.scale, z: 0.65 * spot.scale },
        yaw: 0,
      });
    }
  }

  private addSnowDrifts(): void {
    const random = randomGenerator(613);
    const spots: Array<{ x: number; z: number; sx: number; sy: number; sz: number }> = [];
    for (let index = 0; index < this.track.path.length; index += 6) {
      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      const outwardX = Math.cos(yaw);
      const outwardZ = -Math.sin(yaw);
      const offset = this.track.wallOffset + 3.2 + random() * 1.6;
      const x = point.x + outwardX * offset;
      const z = point.z + outwardZ * offset;
      if (insideLake(x, z) || this.nearRoad(x, z, this.track.wallOffset + 1.5)) continue;
      spots.push({
        x,
        z,
        sx: 1.4 + random() * 1.8,
        sy: 0.35 + random() * 0.45,
        sz: 1.1 + random() * 1.4,
      });
    }
    buildSnowDrifts(spots, this.group);
  }

  private addHills(): void {
    buildHills(
      [
        { x: -136, z: -115, sx: 32, sy: 24, sz: 29 },
        { x: 131, z: -113, sx: 31, sy: 30, sz: 30 },
        { x: -138, z: 120, sx: 30, sy: 22, sz: 27 },
        { x: 131, z: 124, sx: 33, sy: 27, sz: 28 },
        { x: -55, z: -144, sx: 36, sy: 25, sz: 26 },
        { x: 41, z: 146, sx: 41, sy: 26, sz: 23 },
      ],
      this.group,
      0xd2e9f4,
    );
  }

  private addClouds(): void {
    const random = randomGenerator(7401);
    const spots = [];
    for (const [x, y, z] of [
      [-100, 52, -100],
      [70, 56, -112],
      [112, 49, 60],
      [-114, 54, 78],
      [8, 60, -12],
    ]) {
      for (let index = 0; index < 3; index++) {
        spots.push({
          x: x + (random() - 0.5) * 11,
          y: y + (random() - 0.5) * 3,
          z: z + (random() - 0.5) * 9,
          scale: 2.3 + random() * 2.4,
        });
      }
    }
    buildClouds(spots, this.group);
  }

  private addBoards(): void {
    for (const [t, label] of [
      [0.215, "NORTH CROSSING"], [0.345, "PENGUIN BEND"],
      [0.465, "ICE HOP"], [0.64, "FROZEN GARDEN"],
      [0.93, "VANILLA LAKE"],
    ] as const) {
      const boardMaterial = signMaterial(label, "ice");
      const index = Math.round(t * this.track.path.length) % this.track.path.length;
      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      const outwardX = Math.cos(yaw);
      const outwardZ = -Math.sin(yaw);
      const offset = this.track.wallOffset + 0.4;
      this.group.add(
        createTracksideBoard(
          point.x + outwardX * offset,
          point.z + outwardZ * offset,
          point.x,
          point.z,
          boardMaterial,
        ),
      );
    }
  }

  private nearRoad(x: number, z: number, margin: number): boolean {
    return this.track.path.some((point, index) => {
      const next = this.track.path[(index + 1) % this.track.path.length];
      const dx = next.x - point.x;
      const dz = next.z - point.z;
      const lengthSq = Math.max(dx * dx + dz * dz, 0.0001);
      const along = THREE.MathUtils.clamp(
        ((x - point.x) * dx + (z - point.z) * dz) / lengthSq,
        0,
        1,
      );
      return (
        Math.hypot(x - point.x - dx * along, z - point.z - dz * along) <
        margin
      );
    });
  }
}
