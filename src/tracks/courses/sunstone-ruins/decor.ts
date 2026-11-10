import * as THREE from "three";
import { randomGenerator } from "../../../decor/common";
import { buildClouds } from "../../../decor/nature/clouds";
import { createGroundCover } from "../../../decor/nature/ground-cover";
import {
  createTracksideBoard,
  RaceDecor,
  signMaterial,
  type Decoration,
} from "../../../decor";
import type { ColliderBox } from "../../../core/types";
import { VISUAL_QUALITY } from "../../../core/visual-quality";
import type { TrackLike } from "../../track";
import {
  createObelisk,
  createPyramid,
  createRuinColumn,
  createSphinx,
} from "./monuments";
import { buildDesertScrub, buildDesertRocks, Oasis } from "./scenery";
import { SunstoneTunnel } from "./tunnel";
import { sunstoneRuinsLayout } from "./layout";
import { buildDuneLandscape, SUNSTONE_PYRAMIDS } from "./dunes";
import { SunstoneDetails } from "./details";

/** Egyptian circuit composition: tunnel, pyramids, sphinx, oasis, and dunes. */
export class SunstoneRuinsDecor implements Decoration {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  private readonly raceDecor: RaceDecor;
  private readonly tunnel: SunstoneTunnel;
  private readonly oasis: Oasis;

  constructor(private readonly track: TrackLike) {
    this.group.name = "sunstone-ruins-scenery";
    this.group.add(buildDuneLandscape(track));

    this.raceDecor = new RaceDecor(track, {
      banner: "SUNSTONE RUINS",
      theme: "desert",
      lineColor: 0xf2d37e,
      curbColors: [0x1d7477, 0xf0d59a],
      curbExclusions: sunstoneRuinsLayout.features!.ramps!.map((ramp) => ({
        from: ramp.t - 0.016,
        to: ramp.t + 0.032,
      })),
    });
    this.group.add(this.raceDecor.group);
    this.colliders.push(...this.raceDecor.colliders);

    this.tunnel = new SunstoneTunnel(track);
    this.group.add(this.tunnel.group);
    this.colliders.push(...this.tunnel.colliders);

    this.oasis = new Oasis(-25, 42);
    this.group.add(this.oasis.group);

    this.addPyramids();
    this.addSphinx();
    this.addStartMonuments();
    this.addRuins();
    this.addRocks();
    this.addScrub();
    const details = new SunstoneDetails(track);
    this.group.add(details.group);
    this.colliders.push(...details.colliders);
    this.addClouds();
    this.addBoards();
    // Dry tufts and gravel on the sand; floor, water, and ruins stay clear.
    this.group.add(createGroundCover(track, {
      seed: 9127,
      grass: { base: 0xe2c27e, tip: 0xb39a55, spacing: 1.6, density: 0.35 },
      pebbles: { color: 0xb08550, spacing: 5 },
      avoid: this.colliders,
      flatRoot: this.group,
    }));
  }

  update(dt: number): void {
    this.tunnel.update(dt);
    this.oasis.update(dt);
  }

  setStartLights(label: string | null): void {
    this.raceDecor.setStartLights(label);
  }

  private addPyramids(): void {
    for (const placement of SUNSTONE_PYRAMIDS) {
      this.group.add(createPyramid(placement));
      const half = placement.base / 2;
      this.colliders.push({
        center: { x: placement.x, y: placement.height / 2, z: placement.z },
        half: { x: half, y: placement.height / 2, z: half },
        yaw: placement.rotation ?? 0,
      });
    }
  }

  private addSphinx(): void {
    const frame = this.frame(0.045, 17.2);
    const sphinx = createSphinx({
      x: frame.x,
      z: frame.z,
      scale: 1.08,
      rotation: frame.yaw + Math.PI / 2,
    });
    this.group.add(sphinx);
    this.colliders.push({
      center: { x: frame.x, y: 3.2, z: frame.z },
      half: { x: 8.8, y: 3.2, z: 5.6 },
      yaw: frame.yaw + Math.PI / 2,
    });
  }

  private addStartMonuments(): void {
    for (const lateral of [-14, 14]) {
      const frame = this.frame(0.012, lateral);
      const obelisk = createObelisk({
        x: frame.x,
        z: frame.z,
        height: 11,
        rotation: frame.yaw,
      });
      this.group.add(obelisk);
      this.colliders.push({
        center: { x: frame.x, y: 5.5, z: frame.z },
        half: { x: 1.45, y: 5.5, z: 1.45 },
        yaw: frame.yaw,
      });
    }

    // Broken colonnade on the inside of the start straight.
    for (let index = 0; index < 4; index++) {
      const frame = this.frame(0.024 + index * 0.009, -12.4);
      const height = 4.2 + (index % 3) * 1.1;
      this.group.add(
        createRuinColumn({
          x: frame.x,
          z: frame.z,
          height,
          rotation: frame.yaw,
        }),
      );
      this.colliders.push({
        center: { x: frame.x, y: height / 2, z: frame.z },
        half: { x: 0.85, y: height / 2, z: 0.85 },
        yaw: frame.yaw,
      });
    }

    // Two smaller obelisks on the oasis axis.
    for (const lateral of [-15.5, 15.5]) {
      const frame = this.frame(0.79, lateral);
      this.group.add(
        createObelisk({
          x: frame.x,
          z: frame.z,
          height: 8,
          rotation: frame.yaw,
        }),
      );
    }
  }

  private addRuins(): void {
    const ruins = [
      { t: 0.29, lateral: -14, height: 5.1 },
      { t: 0.31, lateral: -15.4, height: 2.8 },
      { t: 0.51, lateral: 13.8, height: 3.6 },
      { t: 0.82, lateral: -14.6, height: 4.8 },
      { t: 0.89, lateral: 14.8, height: 3.3 },
    ];
    for (const ruin of ruins) {
      const frame = this.frame(ruin.t, ruin.lateral);
      this.group.add(
        createRuinColumn({
          x: frame.x,
          z: frame.z,
          height: ruin.height,
          rotation: frame.yaw,
        }),
      );
      this.colliders.push({
        center: { x: frame.x, y: ruin.height / 2, z: frame.z },
        half: { x: 0.9, y: ruin.height / 2, z: 0.9 },
        yaw: frame.yaw,
      });
    }

    const fallen = [
      { t: 0.07, lateral: -20 },
      { t: 0.475, lateral: 19 },
      { t: 0.86, lateral: 20 },
    ];
    for (const spot of fallen) {
      const frame = this.frame(spot.t, spot.lateral);
      this.group.add(
        createRuinColumn({
          x: frame.x,
          z: frame.z,
          height: 5.5,
          rotation: frame.yaw + 0.4,
          fallen: true,
        }),
      );
    }

    // Avenue of obelisks in front of the west pyramid portal.
    for (const [x, z, height] of [
      [-113, 22, 7], [-137, 22, 7], [-113, 34, 6], [-137, 34, 6],
    ] as const) {
      this.group.add(createObelisk({ x, z, height, rotation: Math.PI / 4 }));
      this.colliders.push({
        center: { x, y: height / 2, z },
        half: { x: 1.3, y: height / 2, z: 1.3 },
        yaw: Math.PI / 4,
      });
    }
  }

  private addRocks(): void {
    const random = randomGenerator(4319);
    const rocks = [];
    const count = Math.max(12, Math.round(26 * VISUAL_QUALITY.sceneryDensity));
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + random() * 0.2;
      const radius = 90 + random() * 48;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const scale = 0.8 + random() * 2.1;
      if (
        Math.abs(x) > 152 ||
        Math.abs(z) > 152 ||
        this.nearRoad(x, z, this.track.wallOffset + scale + 3)
      ) {
        continue;
      }
      rocks.push({ x, z, scale, rotation: random() * Math.PI, shade: index % 3 });
    }
    // Larger rocks around the pyramids and the tunnel.
    for (const [x, z, scale] of [
      [-78, -82, 2.8], [-70, 86, 2.4], [88, 54, 2.2], [102, -24, 2.1],
      [-20, -94, 2.5], [-3, 62, 1.8], [60, 10, 1.6],
    ] as const) {
      if (!this.nearRoad(x, z, this.track.wallOffset + scale + 3)) {
        rocks.push({ x, z, scale, rotation: 0, shade: rocks.length % 3 });
      }
    }
    buildDesertRocks(rocks, this.group);
    for (const rock of rocks) {
      if (rock.scale < 1.4) continue;
      this.colliders.push({
        center: { x: rock.x, y: rock.scale * 0.55, z: rock.z },
        half: { x: rock.scale * 0.7, y: rock.scale * 0.55, z: rock.scale * 0.7 },
        yaw: rock.rotation,
      });
    }
  }

  private addScrub(): void {
    const random = randomGenerator(8117);
    const scrub = [];
    const count = Math.max(14, Math.round(32 * VISUAL_QUALITY.sceneryDensity));
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + random() * 0.3;
      const radius = 34 + random() * 104;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.abs(x) > 150 || Math.abs(z) > 150) continue;
      if (this.nearRoad(x, z, this.track.wallOffset + 3.5)) continue;
      if (Math.hypot(x + 25, z - 42) < 18) continue;
      const scale = 0.75 + random() * 0.7;
      const entry = { x, y: 0, z, scale, yaw: random() * Math.PI * 2 };
      scrub.push(entry);
    }
    buildDesertScrub(scrub, this.group);
  }

  private addClouds(): void {
    const random = randomGenerator(6043);
    const spots = [];
    for (const [x, y, z] of [
      [-96, 58, -92],
      [72, 62, -104],
      [108, 54, 54],
      [-108, 60, 72],
      [0, 68, 0],
    ]) {
      for (let index = 0; index < 3; index++) {
        spots.push({
          x: x + (random() - 0.5) * 13,
          y: y + (random() - 0.5) * 3,
          z: z + (random() - 0.5) * 10,
          scale: 2.4 + random() * 2.6,
        });
      }
    }
    buildClouds(spots, this.group);
  }

  private addBoards(): void {
    for (const [t, label] of [
      [0.1, "SPHINX STRAIGHT"],
      [0.22, "SCARAB CLIMB"],
      [0.52, "RA'S GATE"],
      [0.78, "OASIS BEND"],
      [0.92, "SUNSTONE RUINS"],
    ] as const) {
      const frame = this.frame(t, 9.6);
      this.group.add(
        createTracksideBoard(
          frame.x,
          frame.z,
          frame.point.x,
          frame.point.z,
          signMaterial(label, "desert"),
        ),
      );
    }
  }

  private frame(t: number, lateral: number) {
    const index =
      Math.round(((t % 1) + 1) % 1 * this.track.path.length) %
      this.track.path.length;
    const point = this.track.path[index];
    const yaw = this.track.pathYaw(index);
    return {
      point,
      yaw,
      x: point.x - Math.cos(yaw) * lateral,
      z: point.z + Math.sin(yaw) * lateral,
    };
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
