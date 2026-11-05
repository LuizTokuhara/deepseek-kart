import * as THREE from "three";
import type { TrackLike } from "../../track";
import type { Decoration } from "../../../decor/types";
import type { ColliderBox } from "../../../core/types";
import { createFestivalFlag, createFestivalPlanter } from "../../../decor/props/festival-props";
import { addBox } from "../../../decor/common";
import { mergeStaticDecoration } from "../../../decor/merge-static";
import { celMaterial } from "../../../rendering/cel-shading";

/** Art-directed 60 m start straight; every solid prop stays behind the barriers. */
export class StartVillage implements Decoration {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  private readonly animated: Decoration[] = [];

  constructor(track: TrackLike) {
    this.group.name = "tropical-start-village";
    const frame = new THREE.Group();
    frame.position.set(track.spawn.pos.x, 0, track.spawn.pos.z);
    frame.rotation.y = track.spawn.yaw;
    this.group.add(frame);
    const add = (decor: Decoration, x: number, z: number, yaw = 0): void => {
      decor.group.position.set(x, 0, z);
      decor.group.rotation.y = yaw;
      frame.add(decor.group);
      frame.updateMatrixWorld(true);
      for (const box of decor.colliders) {
        const p = new THREE.Vector3(box.center.x, box.center.y, box.center.z)
          .applyMatrix4(decor.group.matrixWorld);
        this.colliders.push({ center: { x: p.x, y: p.y, z: p.z }, half: { ...box.half },
          yaw: box.yaw + yaw + track.spawn.yaw });
      }
      if (decor.update) this.animated.push(decor);
    };
    const paving = celMaterial(0xc9b68b);
    const joints = celMaterial(0xa68c66);
    const trim = celMaterial(0xf6e7bf);
    const rubber = celMaterial(0x314c48);
    for (const side of [-1, 1]) {
      for (const z of [14, 30, 46, 62]) {
        add(createFestivalPlanter(), side * 8.5, z);
      }
      for (const [i, z] of [12, 36, 60].entries()) {
        add(createFestivalFlag(i % 2 ? 0xf17d59 : 0x268e83), side * 9.8, z, side > 0 ? Math.PI : 0);
      }
      addBox(frame, 0.62, 0.045, 60, trim, side * track.wallOffset, 1.22, 33);
      addBox(frame, 0.64, 0.13, 60, rubber, side * track.wallOffset, 0.1, 33);
      for (let z = 5; z < 63; z += 3.6) {
        addBox(frame, 0.025, 0.16, 0.44, trim, side * (track.wallOffset - 0.31), 0.81, z);
      }
      // A narrow, warm stone promenade visually joins the separate props.
      addBox(frame, 2.9, 0.06, 62, paving, side * 8.6, 0.04, 33);
      for (let z = 3; z < 65; z += 2) {
        addBox(frame, 2.9, 0.008, 0.025, joints, side * 8.6, 0.074, z);
      }
    }
    // Thin roof cap completes the gantry silhouette without lowering its clearance.
    const roof = addBox(frame, 16.8, 0.18, 2.5, celMaterial(0x20594f), 0, 6.9, 6);
    roof.castShadow = true;
    addBox(frame, 17, 0.09, 2.65, celMaterial(0xf4cc75), 0, 6.78, 6);
    mergeStaticDecoration(frame);
  }

  update(dt: number): void {
    for (const decor of this.animated) decor.update?.(dt);
  }
}
