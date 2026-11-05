import * as THREE from "three";
import type { TrackLike } from "../../track";
import type { Decoration } from "../../../decor/types";
import type { ColliderBox } from "../../../core/types";
import { addBox, type Placement } from "../../../decor/common";
import { mergeStaticDecoration } from "../../../decor/merge-static";
import { createCourseEdging } from "../../../decor/race/course-edging";
import { createGardenPavilion } from "../../../decor/props/garden-pavilion";
import { createFestivalFlag, createFestivalPlanter } from "../../../decor/props/festival-props";
import { createCurveMarker } from "../../../decor/props/curve-marker";
import { buildTrees, type TreeSpot } from "../../../decor/nature/trees";
import { createGroundPlantBatches } from "../../../decor/nature/palms";
import { celMaterial } from "../../../rendering/cel-shading";
import { racewayLayout } from "./layout";

/** Shared by procedural scenery exclusions: this sector has deliberate placement. */
export function inGardenReturn(x: number, z: number): boolean {
  return (x < -35 && z > -22 && z < 62) || (x > -35 && x < 50 && z > 38 && z < 51);
}

/** Spectator promenade, garden landmark and the western return straight. */
export class GardenReturn implements Decoration {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  private readonly animated: Decoration[] = [];

  constructor(track: TrackLike) {
    this.group.name = "garden-return";
    const props = new THREE.Group();
    this.group.add(props);
    const place = (decor: Decoration, x: number, z: number, yaw = 0) => {
      decor.group.position.set(x, 0, z);
      decor.group.rotation.y = yaw;
      props.add(decor.group);
      decor.group.updateMatrixWorld(true);
      for (const box of decor.colliders) {
        const p = new THREE.Vector3(box.center.x, box.center.y, box.center.z)
          .applyMatrix4(decor.group.matrixWorld);
        this.colliders.push({ center: { x: p.x, y: p.y, z: p.z }, half: { ...box.half }, yaw: box.yaw + yaw });
      }
      if (decor.update) this.animated.push(decor);
    };
    const pointAt = (t: number, offset: number) => {
      const i = Math.floor(t * track.path.length), p = track.path[i], yaw = track.pathYaw(i);
      return { x: p.x + Math.cos(yaw) * offset, z: p.z - Math.sin(yaw) * offset, yaw };
    };
    props.add(createCourseEdging(track, racewayLayout, {
      from: 0.50, to: 0.94, colors: [0xf17d59, 0xffedc3],
    }));
    // Small paving islands follow the chicane without blocking the stand's front.
    const paving = celMaterial(0xc9b68b);
    for (const t of [0.52, 0.56, 0.60, 0.64]) {
      const p = pointAt(t, 9.8);
      place(createFestivalPlanter(), p.x, p.z, p.yaw);
      addBox(props, 2.4, 0.06, 6.4, paving, p.x, 0.035, p.z, p.yaw);
    }
    for (const t of [0.52, 0.60]) {
      const p = pointAt(t, 12.2);
      place(createFestivalFlag(0xf17d59), p.x, p.z, p.yaw);
    }
    for (const t of [0.54, 0.61]) {
      const i = Math.floor(t * track.path.length);
      const turn = track.pathYawDelta(i, 3);
      const side = turn > 0 ? 1 : -1;
      const p = pointAt(t, side * 9.4);
      place(createCurveMarker(turn > 0 ? -1 : 1), p.x, p.z, p.yaw + Math.PI);
    }
    for (const t of [0.765, 0.79, 0.815]) {
      const p = pointAt(t, 9.6);
      place(createCurveMarker(1), p.x, p.z, p.yaw + Math.PI);
    }
    place(createGardenPavilion("GROVE TURN"), -84, 35, Math.PI / 2);
    // Return-straight accents sit beyond the barriers, leaving the apex visible.
    for (const z of [10, -10]) {
      place(createFestivalPlanter(), -74.5, z);
      place(createFestivalFlag(0x268e83), -77, z - 4, Math.PI / 2);
      addBox(props, 3.1, 0.06, 7, paving, -74.5, 0.035, z);
    }
    const trees: TreeSpot[] = [
      { x: -47, z: 15, scale: 1.2, rotation: 0.4, foliage: "a", variant: "spreading" },
      { x: -42, z: 11, scale: 1.05, rotation: 2, foliage: "b", variant: "round" },
      { x: -49, z: 8, scale: 1.3, rotation: 1, foliage: "a", variant: "column" },
      { x: -91, z: 44, scale: 1.5, rotation: 0.8, foliage: "a", variant: "spreading" },
      { x: -86, z: 48, scale: 1.2, rotation: 2, foliage: "b", variant: "round" },
      { x: -87, z: 17, scale: 1.35, rotation: 1, foliage: "a", variant: "column" },
      { x: -83, z: 13, scale: 1, rotation: 2, foliage: "b", variant: "round" },
      { x: -84, z: -5, scale: 1.4, rotation: 0.3, foliage: "a", variant: "spreading" },
      { x: -89, z: -11, scale: 1.1, rotation: 2, foliage: "b", variant: "column" },
    ];
    buildTrees(trees, this.group);
    for (const tree of trees) this.colliders.push({ center: { x: tree.x, y: 1.5, z: tree.z },
      half: { x: 0.32 * tree.scale, y: 1.5, z: 0.32 * tree.scale }, yaw: 0 });
    const plants: Placement[] = [], flowers: Placement[] = [];
    for (const center of [{ x: -46, z: 12 }, { x: -87, z: 44 }, { x: -84, z: -6 }]) {
      for (let i = 0; i < 20; i++) {
        const angle = i * 2.4, radius = 2 + i % 4;
        const spot = { x: center.x + Math.cos(angle) * radius, y: 0.02,
          z: center.z + Math.sin(angle) * radius, scale: 0.65 + (i % 3) * 0.2, yaw: angle };
        plants.push(spot);
        if (i % 2 === 0) flowers.push({ ...spot, y: 0.42, scale: 0.22 });
      }
    }
    createGroundPlantBatches(this.group, plants, [], flowers, []);
    mergeStaticDecoration(props);
  }

  update(dt: number): void {
    this.animated.forEach(decor => decor.update?.(dt));
  }
}
