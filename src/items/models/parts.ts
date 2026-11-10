import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Unlit material that skips the ink pass (eyes, glints, flames). */
export function unlitMaterial(color: THREE.ColorRepresentation): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color });
  material.userData.outlineParameters = { visible: false };
  return material;
}

/**
 * Merges every piece that shares a material into one mesh, so a model costs
 * one draw call (plus its ink hull) per material. The pieces are disposed.
 */
export function part(
  parent: THREE.Object3D,
  pieces: readonly THREE.BufferGeometry[],
  material: THREE.Material,
  castShadow = true,
): THREE.Mesh {
  const flat = pieces.map((piece) => {
    const geometry = piece.index ? piece.toNonIndexed() : piece.clone();
    geometry.deleteAttribute("uv");
    return geometry;
  });
  const merged = mergeGeometries(flat, false)!;
  for (const geometry of [...pieces, ...flat]) geometry.dispose();
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = castShadow;
  parent.add(mesh);
  return mesh;
}

/** Turned profile around +Y; points are [radius, height]. */
export function lathe(profile: readonly (readonly [number, number])[], segments = 20): THREE.LatheGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** Turned profile around +Z (nose forward); points are [radius, z]. */
export function latheZ(profile: readonly (readonly [number, number])[], segments = 20): THREE.LatheGeometry {
  return lathe(profile, segments).rotateX(Math.PI / 2) as THREE.LatheGeometry;
}

/** Radius of a [radius, position] profile at `at`, by linear interpolation. */
export function profileRadius(profile: readonly (readonly [number, number])[], at: number): number {
  for (let i = 1; i < profile.length; i++) {
    const [r0, p0] = profile[i - 1];
    const [r1, p1] = profile[i];
    if (at >= Math.min(p0, p1) && at <= Math.max(p0, p1)) {
      return r0 + (r1 - r0) * ((at - p0) / (p1 - p0 || 1));
    }
  }
  return profile[profile.length - 1][0];
}

/** Tapered rod from `start` along `direction`, `length` long. */
export function taperedRod(
  start: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  baseRadius: number,
  tipRadius: number,
): THREE.BufferGeometry {
  const rod = new THREE.CylinderGeometry(tipRadius, baseRadius, length, 10, 1);
  rod.translate(0, length / 2, 0);
  rod.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), direction.clone().normalize(),
  ));
  return rod.translate(start.x, start.y, start.z);
}

/** Smooth tube through `points`. */
export function tube(points: readonly THREE.Vector3[], radius: number): THREE.TubeGeometry {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([...points]), Math.max(12, points.length * 6), radius, 8, false,
  );
}

/**
 * Extruded outline with rounded edges, centered on its thickness. `centered`
 * also moves the outline's middle to the origin; otherwise the shape keeps
 * its own coordinates.
 */
export function extrudedShape(
  shape: THREE.Shape,
  depth: number,
  bevel: number,
  centered = true,
): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    steps: 1,
    curveSegments: 10,
  });
  if (centered) geometry.center();
  else geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** Oil-drop silhouette (point up), `height` tall. */
export function dropShape(height: number): THREE.Shape {
  const r = height * 0.32;
  const shape = new THREE.Shape();
  shape.moveTo(0, height / 2);
  shape.bezierCurveTo(r * 0.4, height * 0.18, r, 0, r, -height / 2 + r);
  shape.absarc(0, -height / 2 + r, r, 0, Math.PI, true);
  shape.bezierCurveTo(-r, 0, -r * 0.4, height * 0.18, 0, height / 2);
  return shape;
}
