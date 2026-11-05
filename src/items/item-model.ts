import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { outlinedMaterial } from "../rendering/cel-shading";
import { COLORS } from "../core/config";
import type { ItemType } from "../core/types";

const cream = outlinedMaterial(0xffedba, 0.0015);
const white = outlinedMaterial(0xfff8e8);
const yellow = outlinedMaterial(COLORS.banana, 0.002);
const brown = outlinedMaterial(0x78502b, 0.001);
const ink = new THREE.MeshBasicMaterial({ color: 0x17202b });
ink.userData.outlineParameters = { visible: false };
const sphere = new THREE.SphereGeometry(1, 12, 8);

function mesh(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(x, y, z);
  result.castShadow = true;
  parent.add(result);
  return result;
}

function ellipsoid(
  parent: THREE.Group, material: THREE.Material,
  x: number, y: number, z: number, sx: number, sy: number, sz: number,
): THREE.Mesh {
  const result = mesh(parent, sphere, material, x, y, z);
  result.scale.set(sx, sy, sz);
  return result;
}

function tube(points: THREE.Vector3[], radius: number, closed = false): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed),
    Math.max(12, points.length * 3), radius, 5, closed);
}

function eyes(parent: THREE.Group, y: number, z: number, spacing: number): void {
  for (const side of [-1, 1]) {
    ellipsoid(parent, ink, side * spacing, y, z, 0.019, 0.049, 0.014);
    ellipsoid(parent, white, side * spacing - 0.004, y + 0.019, z + 0.012,
      0.005, 0.009, 0.004);
  }
}

/** A closed, curved peel with a broad face and a thin cross-section. */
function bananaPeel(angle: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.06, 0.4, 0), new THREE.Vector3(0.2, 0.23, 0),
    new THREE.Vector3(0.36, 0.065, 0), new THREE.Vector3(0.51, 0.035, 0),
    new THREE.Vector3(0.57, 0.11, 0),
  ]);
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = 20;
  const sides = 8;
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const width = 0.008 + 0.11 * Math.sin(t * Math.PI) ** 0.7;
    for (let side = 0; side < sides; side++) {
      const a = side / sides * Math.PI * 2;
      const thickness = Math.sin(a) * 0.017;
      const radial = point.x + tangent.y * thickness;
      const across = Math.cos(a) * width;
      positions.push(radial * Math.sin(angle) + across * Math.cos(angle),
        point.y - tangent.x * thickness,
        radial * Math.cos(angle) - across * Math.sin(angle));
      if (ring < rings) {
        const a = ring * sides + side;
        const b = ring * sides + (side + 1) % sides;
        const c = a + sides;
        const d = b + sides;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  // Cap both ends so outline rendering cannot expose the inside of the peel.
  for (const ring of [0, rings]) {
    for (let side = 1; side < sides - 1; side++) {
      const base = ring * sides;
      if (ring === 0) indices.push(base, base + side, base + side + 1);
      else indices.push(base, base + side + 1, base + side);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function banana(): THREE.Group {
  const group = new THREE.Group();
  const profile = [[0, 0.07], [0.08, 0.1], [0.13, 0.2], [0.13, 0.4],
    [0.10, 0.61], [0.055, 0.75], [0.02, 0.81], [0, 0.82]];
  const body = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  const position = body.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    position.setX(i, position.getX(i) + 0.1 * (position.getY(i) / 0.82) ** 2);
  }
  body.computeVertexNormals();
  mesh(group, body, yellow);
  const peels = Array.from({ length: 3 }, (_, i) => bananaPeel(i / 3 * Math.PI * 2));
  mesh(group, mergeGeometries(peels, false)!, yellow);
  peels.forEach(geometry => geometry.dispose());
  mesh(group, tube([new THREE.Vector3(0.087, 0.77, 0),
    new THREE.Vector3(0.11, 0.84, 0), new THREE.Vector3(0.13, 0.86, 0)], 0.021), brown);
  const face = new THREE.Group();
  face.position.x = 0.035;
  group.add(face);
  eyes(face, 0.51, 0.115, 0.041);
  mesh(face, tube([new THREE.Vector3(-0.04, 0.4, 0.127),
    new THREE.Vector3(0, 0.378, 0.135), new THREE.Vector3(0.04, 0.4, 0.127)], 0.008), ink);
  return group;
}

function shell(red: boolean): THREE.Group {
  const group = new THREE.Group();
  const paint = outlinedMaterial(red ? COLORS.redShell : COLORS.shell, 0.002);
  const dome = new THREE.SphereGeometry(0.37, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.8, 1);
  mesh(group, dome, paint, 0, 0.13, 0);
  ellipsoid(group, cream, 0, 0.075, 0, 0.34, 0.075, 0.34);
  const rim = mesh(group, new THREE.TorusGeometry(0.365, 0.052, 8, 32), cream, 0, 0.12, 0);
  rim.rotation.x = Math.PI / 2;
  const surface = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(
    x, 0.13 + 0.3 * Math.sqrt(Math.max(0, 1 - (x * x + z * z) / (0.375 ** 2))), z,
  );
  const seams: THREE.BufferGeometry[] = [];
  const hexagon = Array.from({ length: 6 }, (_, i) => {
    const angle = i / 6 * Math.PI * 2;
    return new THREE.Vector2(Math.cos(angle) * 0.18, Math.sin(angle) * 0.18);
  });
  for (let i = 0; i < 6; i++) {
    const a = hexagon[i];
    const b = hexagon[(i + 1) % 6];
    seams.push(tube(Array.from({ length: 7 }, (_, step) => {
      const t = step / 6;
      return surface(THREE.MathUtils.lerp(a.x, b.x, t), THREE.MathUtils.lerp(a.y, b.y, t));
    }), 0.007));
    seams.push(tube(Array.from({ length: 10 }, (_, step) => {
      const radius = 0.18 + step / 9 * 0.192;
      return surface(a.x / 0.18 * radius, a.y / 0.18 * radius);
    }), 0.007));
  }
  mesh(group, mergeGeometries(seams, false)!,
    outlinedMaterial(red ? 0x762e32 : 0x17633c));
  seams.forEach(geometry => geometry.dispose());
  ellipsoid(group, ink, 0, 0.12, 0.365, 0.095, 0.045, 0.013);
  return group;
}

/** A circular spot projected onto the curved mushroom cap. */
function capSpot(normal: THREE.Vector3): THREE.BufferGeometry {
  const u = new THREE.Vector3().crossVectors(normal,
    Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = 5;
  const sides = 20;
  for (let ring = 0; ring <= rings; ring++) {
    const radius = ring / rings * 0.31;
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const point = normal.clone().multiplyScalar(Math.cos(radius))
        .addScaledVector(u, Math.cos(angle) * Math.sin(radius))
        .addScaledVector(v, Math.sin(angle) * Math.sin(radius));
      positions.push(point.x * 0.423, 0.46 + point.y * 0.339, point.z * 0.423);
      if (ring < rings && side < sides) {
        const a = ring * (sides + 1) + side;
        const b = a + sides + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function mushroom(): THREE.Group {
  const group = new THREE.Group();
  const stem = new THREE.LatheGeometry([[0, 0], [0.14, 0], [0.19, 0.06],
    [0.2, 0.22], [0.16, 0.4], [0, 0.45]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  mesh(group, stem, cream);
  const cap = new THREE.SphereGeometry(0.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.8, 1);
  mesh(group, cap, outlinedMaterial(0xef4b42, 0.002), 0, 0.46, 0);
  mesh(group, new THREE.CylinderGeometry(0.415, 0.385, 0.045, 32), cream, 0, 0.438, 0);
  const spots = [capSpot(new THREE.Vector3(0, 1, 0))];
  for (let i = 0; i < 4; i++) {
    const angle = i / 4 * Math.PI * 2;
    spots.push(capSpot(new THREE.Vector3(Math.sin(0.95) * Math.cos(angle),
      Math.cos(0.95), Math.sin(0.95) * Math.sin(angle))));
  }
  mesh(group, mergeGeometries(spots, false)!, white);
  spots.forEach(geometry => geometry.dispose());
  eyes(group, 0.23, 0.188, 0.057);
  return group;
}

const templates = new Map<ItemType, THREE.Group>();

/** Clones own their transforms; immutable geometry and materials stay shared. */
export function createItemModel(type: ItemType): THREE.Group {
  let template = templates.get(type);
  if (!template) {
    switch (type) {
      case "banana": template = banana(); break;
      case "shell": template = shell(false); break;
      case "red-shell": template = shell(true); break;
      case "mushroom": template = mushroom(); break;
    }
    template.name = `item-${type}`;
    templates.set(type, template);
  }
  return template.clone(true);
}

/** Inventory preview only; these floating models do not collide or shield a kart. */
export class HeldItemDisplay {
  readonly group = new THREE.Group();
  private item: ItemType | null = null;
  private elapsed = 0;

  constructor() {
    this.group.name = "held-items";
    this.group.position.set(0, 1.52, 0);
    this.group.visible = false;
  }

  update(item: ItemType | null, count: number, dt: number): void {
    this.elapsed += dt;
    if (item !== this.item) {
      // Shared resources belong to the templates, so clearing a preview does not dispose them.
      this.group.clear();
      if (item) for (let i = 0; i < 3; i++) this.group.add(createItemModel(item));
      this.item = item;
    }
    this.group.visible = item !== null;
    const visible = Math.min(3, Math.max(1, count));
    this.group.children.forEach((model, index) => {
      model.visible = index < visible;
      model.scale.setScalar(visible === 1 ? 0.68 : 0.52);
      model.position.set((index - (visible - 1) / 2) * 0.56,
        Math.sin(this.elapsed * 2.2 + index * 0.6) * 0.035, 0);
      model.rotation.y = Math.PI + Math.sin(this.elapsed * 0.8) * 0.15;
    });
  }
}
