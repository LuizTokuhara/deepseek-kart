import * as THREE from "three";
import type { TrackLike } from "../../tracks/track";
import type { TrackDefinition } from "../../tracks/definition";
import { GROUND_Y } from "../../core/config";
import { celMaterial } from "../../rendering/cel-shading";
import { addBox, flatMaterial } from "../common";

interface EdgingOptions {
  from: number;
  to: number;
  colors: readonly [number, number];
}

/** Continuous curbs and barrier trim, fitted to the course and its wall gaps. */
export function createCourseEdging(
  track: TrackLike, layout: TrackDefinition, options: EdgingOptions,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "course-edging";
  const colors = options.colors.map(flatMaterial);
  const cream = celMaterial(0xffedc3);
  const rubber = celMaterial(0x314c48);
  const open = (t: number, side: number) => layout.wallGaps.some(
    (gap) => gap.side === side && t > gap.from && t < gap.to,
  );
  const vertex = (i: number, offset: number) => {
    const n = track.path.length;
    const p = track.path[i % n], before = track.path[(i - 1 + n) % n], after = track.path[(i + 1) % n];
    const yaw = Math.atan2(after.x - before.x, after.z - before.z);
    return new THREE.Vector3(p.x + Math.cos(yaw) * offset,
      GROUND_Y + 0.055, p.z - Math.sin(yaw) * offset);
  };
  for (let i = 0; i < track.path.length; i++) {
    const t = i / track.path.length;
    if (t < options.from || t > options.to) continue;
    for (const side of [-1, 1]) {
      // Keep painted stripes out of the grass escape entrances, too.
      if (open(t, side) || open((i + 1) / track.path.length, side)) continue;
      const inner = side * (track.width / 2 - 0.95), outer = side * (track.width / 2 - 0.05);
      const geometry = new THREE.BufferGeometry().setFromPoints([
        vertex(i, inner), vertex(i, outer), vertex(i + 1, outer), vertex(i + 1, inner),
      ]);
      geometry.setIndex(side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();
      group.add(new THREE.Mesh(geometry, colors[i % 2]));
    }
  }
  // Match the barrier builder's exact samples; caps never bridge a wall gap.
  const count = Math.ceil(layout.curve.getLength() / 1.8);
  const edge = (t: number, side: number) => {
    const p = layout.curve.getPointAt(t), tangent = layout.curve.getTangentAt(t);
    return p.add(new THREE.Vector3(tangent.z, 0, -tangent.x)
      .normalize().multiplyScalar(side * track.wallOffset));
  };
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    if (t < options.from || t > options.to) continue;
    for (const side of [-1, 1]) {
      if (open(t, side)) continue;
      const a = edge(i / count, side), b = edge((i + 1) / count, side);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const center = a.clone().add(b).multiplyScalar(0.5);
      const length = a.distanceTo(b) - 0.055;
      addBox(group, layout.style.wallThickness + 0.02, 0.045, length, cream,
        center.x, layout.style.wallHeight + 0.02, center.z, yaw);
      addBox(group, layout.style.wallThickness + 0.04, 0.13, length, rubber,
        center.x, 0.1, center.z, yaw);
      if (i % 3 === 0) {
        const inset = side * (layout.style.wallThickness / 2 + 0.015);
        addBox(group, 0.025, 0.16, 0.44, cream,
          center.x - Math.cos(yaw) * inset, 0.81,
          center.z + Math.sin(yaw) * inset, yaw);
      }
    }
  }
  return group;
}
