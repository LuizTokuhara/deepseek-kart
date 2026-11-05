import * as THREE from "three";
import { randomGenerator } from "../../../decor/common";
import { createBackdrop } from "../../../decor/nature/backdrop";
import { buildClouds, buildHills, buildTrees, RaceDecor, type Decoration, type TreeSpot } from "../../../decor";
import type { ColliderBox } from "../../../core/types";
import type { TrackLike } from "../../track";

/** Different composition, using the same assets and race infrastructure. */
export class MeadowDecor implements Decoration {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  private readonly raceDecor: RaceDecor;

  constructor(track: TrackLike) {
    this.group.add(createBackdrop(track.bounds.maxX - track.bounds.minX,
      track.bounds.maxZ - track.bounds.minZ, 0x568d7b));
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
        trees.push({ x, z, scale, rotation: random() * Math.PI * 2,
          foliage: random() > 0.5 ? "a" : "b" });
        this.colliders.push({
          center: { x, y: 1.325 * scale, z },
          half: { x: 0.32 * scale, y: 1.325 * scale, z: 0.32 * scale }, yaw: 0,
        });
      }
    }
    buildTrees(trees, this.group);
    buildHills([
      { x: -82, z: -65, sx: 18, sy: 12, sz: 16 },
      { x: 82, z: 65, sx: 18, sy: 16, sz: 20 },
      { x: 0, z: 0, sx: 17, sy: 6, sz: 11 },
    ], this.group, 0x58954b);
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
