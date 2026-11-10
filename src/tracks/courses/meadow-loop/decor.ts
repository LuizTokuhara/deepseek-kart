import * as THREE from "three";
import { randomGenerator } from "../../../decor/common";
import { createBackdrop } from "../../../decor/nature/backdrop";
import { meadowEnvironment } from "./environment";
import { createForestBelt } from "../../../decor/nature/forest-belt";
import { createGroundCover } from "../../../decor/nature/ground-cover";
import { hillHeightAt, type HillSpot } from "../../../decor/nature/hills";
import {
  buildClouds,
  buildHills,
  buildTrees,
  hillColliders,
  RaceDecor,
  type Decoration,
  type TreeSpot,
} from "../../../decor";
import type { ColliderBox } from "../../../core/types";
import type { TrackLike } from "../../track";

const HILLS: readonly HillSpot[] = [
  { x: -82, z: -65, sx: 18, sy: 12, sz: 16 },
  { x: 82, z: 65, sx: 18, sy: 16, sz: 20 },
  { x: 0, z: 0, sx: 17, sy: 6, sz: 11 },
];

/** Trees on top of the large hills, to break up the smooth silhouette. */
function hillTrees(track: TrackLike): TreeSpot[] {
  const random = randomGenerator(5903);
  const spots: TreeSpot[] = [];
  for (const hill of HILLS.filter((spot) => spot.sy >= 10)) {
    for (let attempt = 0; attempt < 9; attempt++) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 0.62;
      const x = hill.x + Math.cos(angle) * radius * hill.sx;
      const z = hill.z + Math.sin(angle) * radius * hill.sz;
      if (spots.some((tree) => Math.hypot(tree.x - x, tree.z - z) < 4)) continue;
      const ground = Math.max(hillHeightAt(hill, x, z), track.groundHeightAt?.(x, z) ?? 0);
      spots.push({ x, y: ground - 0.3, z, scale: 0.9 + random() * 0.5,
        rotation: random() * Math.PI * 2, foliage: random() > 0.5 ? "a" : "b" });
    }
  }
  return spots;
}

/** Different composition, using the same assets and race infrastructure. */
export class MeadowDecor implements Decoration {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  private readonly raceDecor: RaceDecor;

  constructor(track: TrackLike) {
    this.group.add(createBackdrop(track.bounds.maxX - track.bounds.minX,
      track.bounds.maxZ - track.bounds.minZ, 0x568d7b, meadowEnvironment.background));
    this.group.name = "meadow-scenery";
    this.raceDecor = new RaceDecor(track, {
      banner: "MEADOW LOOP", lineColor: 0xffd66b, curbColors: [0x3e8dd4, 0xfff3d6],
    });
    this.group.add(this.raceDecor.group);
    this.colliders.push(...this.raceDecor.colliders);

    const trees: TreeSpot[] = [];
    const random = randomGenerator(4721);
    for (let index = 0; index < track.path.length; index += 13) {
      const point = track.path[index];
      const yaw = track.pathYaw(index);
      const groveSize = 2 + Math.floor(random() * 2);
      for (let member = 0; member < groveSize; member++) {
        const offset = track.width / 2 + 9 + random() * 7;
        const along = (member - 1) * 5 + random() * 2;
        const x = point.x + Math.cos(yaw) * offset + Math.sin(yaw) * along;
        const z = point.z - Math.sin(yaw) * offset + Math.cos(yaw) * along;
        if (x < track.bounds.minX + 4 || x > track.bounds.maxX - 4 ||
            z < track.bounds.minZ + 4 || z > track.bounds.maxZ - 4) continue;
        const nearRoad = track.path.some((p, i) => {
          const next = track.path[(i + 1) % track.path.length];
          const dx = next.x - p.x, dz = next.z - p.z;
          const t = THREE.MathUtils.clamp(((x - p.x) * dx + (z - p.z) * dz) /
            Math.max(dx * dx + dz * dz, 0.0001), 0, 1);
          return Math.hypot(x - p.x - dx * t, z - p.z - dz * t) < track.width / 2 + 6;
        });
        if (nearRoad || trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < 4.5)) continue;
        const scale = 0.85 + random() * 0.55;
        trees.push({ x, y: track.groundHeightAt?.(x, z) ?? 0, z, scale,
          rotation: random() * Math.PI * 2,
          foliage: random() > 0.5 ? "a" : "b" });
        this.colliders.push({
          center: { x, y: 1.325 * scale, z },
          half: { x: 0.32 * scale, y: 1.325 * scale, z: 0.32 * scale }, yaw: 0,
        });
      }
    }
    buildTrees(trees, this.group);
    // Away from the real shadow and on a slope: the blob shadow would look crooked.
    buildTrees(hillTrees(track), this.group, false);
    buildHills(HILLS, this.group, 0x6aa752, "grass");
    this.colliders.push(...hillColliders(HILLS));
    this.group.add(createGroundCover(track, {
      seed: 811,
      grass: { base: 0x6fae55, tip: 0xa9d16c, spacing: 0.8 },
      flowers: { colors: [0xffffff, 0xffe066, 0xff9fc4, 0xc3a6ff], spacing: 1.3 },
      pebbles: { color: 0xbdb7aa, spacing: 4 },
      bushes: { color: 0x74aa52, spacing: 6 },
      avoid: this.colliders,
      flatRoot: this.group,
    }));
    this.group.add(createForestBelt(track, {
      seed: 2207, inner: 14, outer: 70, spacing: 6, roadClearance: 30,
      colors: [0x5a8f45, 0x6f9c4b, 0x4c7a46], coniferShare: 0.3,
    }));
    buildClouds([
      { x: -48, y: 35, z: -30, scale: 5 },
      { x: 35, y: 40, z: 15, scale: 7 },
      { x: 0, y: 32, z: 70, scale: 5 },
    ], this.group);
  }

  setStartLights(label: string | null): void {
    this.raceDecor.setStartLights(label);
  }
}
