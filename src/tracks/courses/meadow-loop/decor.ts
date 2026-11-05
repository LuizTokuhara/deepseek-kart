import * as THREE from "three";
import { buildClouds, buildHills, buildTrees, RaceDecor, type Decoration, type TreeSpot } from "../../../decor";
import type { ColliderBox } from "../../../core/types";
import type { TrackLike } from "../../track";

/** Different composition, using the same assets and race infrastructure. */
export class MeadowDecor implements Decoration {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  private readonly raceDecor: RaceDecor;

  constructor(track: TrackLike) {
    this.group.name = "meadow-scenery";
    this.raceDecor = new RaceDecor(track, {
      banner: "MEADOW LOOP", lineColor: 0xffd66b, curbColors: [0x3e8dd4, 0xfff3d6],
    });
    this.group.add(this.raceDecor.group);
    this.colliders.push(...this.raceDecor.colliders);

    const trees: TreeSpot[] = [];
    for (let index = 0; index < track.path.length; index += 5) {
      const point = track.path[index];
      const yaw = track.pathYaw(index);
      const offset = track.width / 2 + 8;
      const x = point.x + Math.cos(yaw) * offset;
      const z = point.z - Math.sin(yaw) * offset;
      const scale = 1 + (index % 3) * 0.2;
      trees.push({ x, z, scale, rotation: index * 0.4, foliage: index % 2 ? "a" : "b" });
      this.colliders.push({
        center: { x, y: 1.2 * scale, z },
        half: { x: 0.32 * scale, y: 1.2 * scale, z: 0.32 * scale }, yaw: 0,
      });
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
