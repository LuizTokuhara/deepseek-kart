import * as THREE from "three";
import { GROUND_Y } from "../../core/config";
import { celMaterial } from "../../rendering/cel-shading";
import type { TrackLike } from "../../tracks/track";

export interface RoadMarkingOptions {
  readonly centerColor: number;
  readonly edgeColor: number;
  /** Length of the centerline dash and gap, in meters. */
  readonly dash: number;
  readonly gap: number;
  /** Crosswalks: position `t` along the lap. */
  readonly crosswalks?: readonly number[];
}

interface Mark {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly y: number;
  readonly length: number;
  readonly width: number;
}

/**
 * Road paint: dashed centerline, continuous edge lines and crosswalks, laid on
 * the deck (including the ramps of an overpass).
 */
export function createRoadMarkings(track: TrackLike, options: RoadMarkingOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = "road-markings";
  const count = track.path.length;
  const spacing = track.pathSpacing;
  const level = (index: number) => track.pathLevel?.(index) ?? 0;
  /** Point on the centerline `distance` meters from the start, interpolated. */
  const sample = (distance: number, lateral: number) => {
    const position = ((distance / spacing) % count + count) % count;
    const index = Math.floor(position);
    const next = (index + 1) % count;
    const f = position - index;
    const a = track.path[index];
    const b = track.path[next];
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const x = a.x + (b.x - a.x) * f + Math.cos(yaw) * lateral;
    const z = a.z + (b.z - a.z) * f - Math.sin(yaw) * lateral;
    const height = level(index) + (level(next) - level(index)) * f;
    return { x, z, yaw, y: track.heightAt?.(x, z, height) ?? height };
  };
  const mark = (from: number, to: number, lateral: number, width: number): Mark => {
    const a = sample(from, lateral);
    const b = sample(to, lateral);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    return {
      x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: (a.y + b.y) / 2,
      yaw: Math.atan2(b.x - a.x, b.z - a.z), pitch: -Math.atan2(b.y - a.y, length),
      length, width,
    };
  };

  const lap = count * spacing;
  const startDistance = (track.nearestPathIndex(track.spawn.pos.x, track.spawn.pos.z)) * spacing;
  const nearStart = (distance: number) =>
    Math.abs(((distance - startDistance + lap * 1.5) % lap) - lap / 2) < 2.5;
  const centre: Mark[] = [];
  const edges: Mark[] = [];
  for (let distance = 0; distance + options.dash < lap; distance += options.dash + options.gap) {
    if (!nearStart(distance)) centre.push(mark(distance, distance + options.dash, 0, 0.2));
  }
  const edge = track.width / 2 - 0.55;
  for (let distance = 0; distance < lap; distance += 2) {
    if (nearStart(distance)) continue;
    for (const side of [-1, 1]) edges.push(mark(distance, distance + 2.04, side * edge, 0.16));
  }
  for (const t of options.crosswalks ?? []) {
    for (let lateral = -edge + 0.6; lateral < edge - 0.3; lateral += 1.1) {
      edges.push(mark(t * lap - 1.6, t * lap + 1.6, lateral, 0.55));
    }
  }

  const dummy = new THREE.Object3D();
  const geometry = new THREE.BoxGeometry(1, 0.02, 1);
  for (const [marks, color, name] of [
    [centre, options.centerColor, "road-centre-line"],
    [edges, options.edgeColor, "road-edge-lines"],
  ] as const) {
    const material = celMaterial(color);
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, marks.length));
    marks.forEach((item, index) => {
      dummy.position.set(item.x, GROUND_Y + item.y + 0.012, item.z);
      dummy.rotation.set(item.pitch, item.yaw, 0, "YXZ");
      dummy.scale.set(item.width, 1, item.length);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.count = marks.length;
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
