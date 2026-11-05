import * as THREE from "three";
import type { TrackLike } from "../../track";
import type { Decoration } from "../../../decor/types";
import type { ColliderBox } from "../../../core/types";
import { GROUND_Y } from "../../../core/config";
import { addBox, flatMaterial, type Placement } from "../../../decor/common";
import { createPalmBatches, createGroundPlantBatches } from "../../../decor/nature/palms";
import { createCurveMarker } from "../../../decor/props/curve-marker";
import { signMaterial } from "../../../decor/props/signs";
import { celMaterial, outlinedMaterial } from "../../../rendering/cel-shading";
import { mergeStaticDecoration } from "../../../decor/merge-static";

/** First right bend: clear apex, readable entry and an open view toward the lagoon. */
export class LagoonBend implements Decoration {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];

  constructor(private readonly track: TrackLike) {
    this.group.name = "lagoon-bend";
    const staticProps = new THREE.Group();
    this.group.add(staticProps);
    const pointAt = (t: number, offset: number) => {
      const i = Math.floor(t * track.path.length);
      const point = track.path[i], yaw = track.pathYaw(i);
      return { x: point.x + Math.cos(yaw) * offset,
        z: point.z - Math.sin(yaw) * offset, yaw };
    };
    // Only the entry has roadside boards. The exit's grass runoff stays open.
    for (const t of [0.246, 0.267, 0.286]) {
      const spot = pointAt(t, 9.3);
      const marker = createCurveMarker(1);
      marker.group.position.set(spot.x, 0, spot.z);
      marker.group.rotation.y = spot.yaw + Math.PI;
      staticProps.add(marker.group);
      this.colliders.push({ center: { x: spot.x, y: 1.1, z: spot.z },
        half: { x: 0.12, y: 1.1, z: 0.12 }, yaw: spot.yaw });
    }
    const curbColors = [flatMaterial(0xf17d59), flatMaterial(0xffedc3)];
    const curbVertex = (i: number, offset: number): THREE.Vector3 => {
      const n = track.path.length;
      const p = track.path[i % n], before = track.path[(i - 1 + n) % n], after = track.path[(i + 1) % n];
      const yaw = Math.atan2(after.x - before.x, after.z - before.z);
      return new THREE.Vector3(p.x + Math.cos(yaw) * offset,
        GROUND_Y + 0.055, p.z - Math.sin(yaw) * offset);
    };
    for (let i = 0; i < track.path.length; i++) {
      const t = i / track.path.length;
      if (t < 0.245 || t > 0.335) continue;
      for (const side of [-1, 1]) {
        if (side === 1 && t >= 0.30) continue;
        // Adjacent quads share their edge exactly: no overlapping slabs/flicker.
        const inner = side * (track.width / 2 - 0.95), outer = side * (track.width / 2 - 0.05);
        const vertices = [curbVertex(i, inner), curbVertex(i, outer),
          curbVertex(i + 1, outer), curbVertex(i + 1, inner)];
        const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
        geometry.setIndex(side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
        geometry.computeVertexNormals();
        staticProps.add(new THREE.Mesh(geometry, curbColors[i % 2]));
      }
    }

    const palms: Placement[] = [
      { x: 38, y: 0, z: -18, scale: 1.2, yaw: 0.4 },
      { x: 43, y: 0, z: -12, scale: 0.95, yaw: 2 },
      { x: 48, y: 0, z: -16, scale: 1.1, yaw: 1.2 },
      { x: 68, y: 0, z: -48, scale: 1.2, yaw: 2.8 },
      { x: 77, y: 0, z: -44, scale: 1.45, yaw: 2 },
      { x: 84, y: 0, z: -39, scale: 0.9, yaw: 0.5 },
    ];
    createPalmBatches(this.group, palms);
    for (const palm of palms) {
      this.colliders.push({ center: { x: palm.x, y: 3, z: palm.z },
        half: { x: 0.55, y: 3, z: 0.55 }, yaw: 0 });
    }
    const plants: Placement[] = [], rocks: Placement[] = [], flowers: Placement[] = [];
    // Layer low vegetation around two islands, leaving the racing line and the
    // view from the exit (x=65) to the water (94,20) unobstructed.
    for (const center of [{ x: 44, z: -15 }, { x: 77, z: -43 }]) {
      for (let i = 0; i < 28; i++) {
        const a = i * 2.4, r = 2 + (i % 4) * 1.1;
        const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
        plants.push({ x, y: 0, z, scale: 0.8 + (i % 3) * 0.18, yaw: a });
        if (i % 3 === 0) flowers.push({ x: x + 0.3, y: 0.5, z, scale: 0.24, yaw: a });
        if (i % 7 === 0) {
          rocks.push({ x, y: 0.15, z, scale: 0.9, yaw: a });
          this.colliders.push({ center: { x, y: 0.6, z }, half: { x: 1, y: 0.6, z: 1 }, yaw: a });
        }
      }
    }
    createGroundPlantBatches(this.group, plants, rocks, flowers, []);
    this.addLandmark(staticProps);
    mergeStaticDecoration(staticProps);
  }

  private addLandmark(parent: THREE.Group): void {
    const monument = new THREE.Group();
    monument.position.set(83, 0, -28);
    monument.rotation.y = -Math.PI / 2;
    parent.add(monument);
    const stone = outlinedMaterial(0x7e8e78, 0.001);
    addBox(monument, 5.8, 0.55, 1.8, stone, 0, 0.275, 0);
    addBox(monument, 5.2, 2.2, 0.65, outlinedMaterial(0x20594f), 0, 1.65, 0);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 1.1), signMaterial("LAGOON BEND", "tropical"));
    face.position.set(0, 1.9, 0.34);
    monument.add(face);
    const sand = new THREE.Mesh(new THREE.CircleGeometry(1, 24), celMaterial(0xe5ce91));
    sand.rotation.x = -Math.PI / 2;
    sand.scale.set(5.5, 3.2, 1); sand.position.y = 0.016;
    monument.add(sand);
    this.colliders.push({ center: { x: 83, y: 1.4, z: -28 },
      half: { x: 2.9, y: 1.4, z: 0.9 }, yaw: -Math.PI / 2 });
  }
}
