import * as THREE from "three";
import { GROUND_Y } from "../core/config";
import { celMaterial } from "../rendering/cel-shading";
import { terrainMaterial } from "../rendering/terrain-material";
import { LEVEL_EPSILON, type ElevationProfile } from "./elevation";

export interface ViaductColors {
  readonly wallColor: number;
  readonly girderColor: number;
  readonly walkwayColor: number;
}

export const DEFAULT_VIADUCT_COLORS: ViaductColors = {
  wallColor: 0x8d8f99, girderColor: 0x4f6b7a, walkwayColor: 0x9a968e,
};

/** Height of the clear-span girder, from the deck to the underside. */
export const DECK_THICKNESS = 0.9;
const STEP = 0.75;

interface Frame {
  readonly t: number;
  readonly point: THREE.Vector3;
  readonly right: THREE.Vector3;
  readonly top: number;
  readonly open: boolean;
}

/** Loose triangles with the face pointing toward `outward`. */
class Faces {
  readonly positions: number[] = [];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();

  /** Quadrilateral with p0-p1 at one end and p2-p3 at the other (p0/p2 on the same side). */
  quad(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3,
    outward: THREE.Vector3): void {
    const normal = this.a.subVectors(p1, p0).cross(this.b.subVectors(p3, p0));
    const corners = normal.dot(outward) >= 0 ? [p0, p1, p3, p0, p3, p2] : [p0, p3, p1, p0, p2, p3];
    for (const p of corners) this.positions.push(p.x, p.y, p.z);
  }

  mesh(material: THREE.Material, name: string): THREE.Mesh | null {
    if (this.positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
}

const lift = (v: THREE.Vector3, y: number): THREE.Vector3 => new THREE.Vector3(v.x, y, v.z);

/**
 * Overpass body: embankment with retaining walls where there is nothing below,
 * a clear span with girder and underside over the road below, abutments
 * closing the embankment on both sides, and a walkway between the track and the parapet.
 * The deck and parapets remain the track road and barriers.
 */
export function buildViaduct(
  curve: THREE.Curve<THREE.Vector3>,
  elevation: ElevationProfile,
  roadHalfWidth: number,
  colors: ViaductColors = DEFAULT_VIADUCT_COLORS,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "viaduct";
  const half = elevation.halfWidth;
  const count = Math.ceil(curve.getLength() / STEP);
  const frames: (Frame | null)[] = [];
  for (let index = 0; index <= count; index++) {
    const t = (index / count) % 1;
    const level = elevation.at(t);
    if (level < LEVEL_EPSILON * 0.2) {
      frames.push(null);
      continue;
    }
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x);
    frames.push({ t, point, right, top: GROUND_Y + level - 0.004,
      open: elevation.openBelow(point.x, point.z) });
  }

  const walls = new Faces();
  const girders = new Faces();
  const walkway = new Faces();
  const pilasters: THREE.Matrix4[] = [];
  const at = (frame: Frame, lateral: number, y: number) =>
    lift(frame.point.clone().addScaledVector(frame.right, lateral), y);

  for (let index = 0; index < count; index++) {
    const a = frames[index];
    const b = frames[index + 1];
    if (!a || !b) continue;
    const open = a.open || b.open;
    for (const side of [-1, 1]) {
      const outward = a.right.clone().multiplyScalar(side);
      // Deck walkway, from the asphalt edge to the parapet.
      walkway.quad(at(a, side * roadHalfWidth, a.top), at(a, side * half, a.top),
        at(b, side * roadHalfWidth, b.top), at(b, side * half, b.top), new THREE.Vector3(0, 1, 0));
      const bottomA = open ? a.top - DECK_THICKNESS : -0.1;
      const bottomB = open ? b.top - DECK_THICKNESS : -0.1;
      (open ? girders : walls).quad(at(a, side * half, bottomA), at(a, side * half, a.top),
        at(b, side * half, bottomB), at(b, side * half, b.top), outward);
    }
    if (open) {
      girders.quad(at(a, -half, a.top - DECK_THICKNESS), at(a, half, a.top - DECK_THICKNESS),
        at(b, -half, b.top - DECK_THICKNESS), at(b, half, b.top - DECK_THICKNESS),
        new THREE.Vector3(0, -1, 0));
    } else if (index % 8 === 0 && a.top > 1.2) {
      for (const side of [-1, 1]) {
        const base = at(a, side * (half + 0.12), a.top / 2);
        pilasters.push(new THREE.Matrix4().compose(base,
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0),
            Math.atan2(a.right.x, a.right.z)),
          new THREE.Vector3(0.7, a.top + 0.1, 0.24)));
      }
    }
  }

  const wallMaterial = celMaterial(colors.wallColor, 0.002);
  for (const mesh of [
    walls.mesh(wallMaterial, "viaduct-retaining-walls"),
    girders.mesh(celMaterial(colors.girderColor, 0.002), "viaduct-span"),
    walkway.mesh(terrainMaterial(colors.walkwayColor, "stone"), "viaduct-walkway"),
  ]) {
    if (mesh) group.add(mesh);
  }
  if (pilasters.length > 0) {
    const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMaterial,
      pilasters.length);
    pilasters.forEach((matrix, index) => ribs.setMatrixAt(index, matrix));
    ribs.name = "viaduct-pilasters";
    ribs.castShadow = ribs.receiveShadow = true;
    group.add(ribs);
  }
  addAbutments(group, frames, half, wallMaterial);
  return group;
}

/** Abutments: walls that close the embankment where the clear span begins and ends. */
function addAbutments(group: THREE.Group, frames: readonly (Frame | null)[], half: number,
  material: THREE.Material): void {
  for (let index = 0; index + 1 < frames.length; index++) {
    const a = frames[index];
    const b = frames[index + 1];
    if (!a || !b || a.open === b.open) continue;
    const solid = a.open ? b : a;
    const toSolid = solid === b ? 1 : -1;
    const tangent = new THREE.Vector3(solid.right.z, 0, -solid.right.x);
    const bottom = -0.05;
    const top = solid.top - 0.02;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.3, top - bottom, 0.9), material);
    wall.position.copy(solid.point).addScaledVector(tangent, 0.45 * toSolid);
    wall.position.y = (top + bottom) / 2;
    wall.rotation.y = Math.atan2(tangent.x, tangent.z);
    wall.name = "viaduct-abutment";
    wall.castShadow = wall.receiveShadow = true;
    group.add(wall);
  }
}
