import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { outlinedMaterial } from "../rendering/cel-shading";
import { COLORS } from "../core/config";
import type { ItemType } from "../core/types";

const oilPaint = outlinedMaterial(COLORS.oilCan, 0.002);
const oilMetal = outlinedMaterial(0x313844, 0.0014);
const oilLabel = outlinedMaterial(0xfff3d4, 0.001);
const lightningGold = outlinedMaterial(COLORS.lightning, 0.0022);
const lightningCore = outlinedMaterial(0xfffbe0, 0.0012);
const ink = new THREE.MeshBasicMaterial({ color: 0x17202b });
ink.userData.outlineParameters = { visible: false };
const exhaust = new THREE.MeshBasicMaterial({ color: 0xffb23a });
exhaust.userData.outlineParameters = { visible: false };

// The slick is unlit so it reads as a dark mirror instead of a lit surface.
const oilStain = new THREE.MeshBasicMaterial({
  color: 0x4a3417,
  polygonOffset: true,
  polygonOffsetFactor: -1,
});
const oilBase = new THREE.MeshBasicMaterial({
  color: COLORS.oilSlick,
  polygonOffset: true,
  polygonOffsetFactor: -2,
});
const oilSheen = new THREE.MeshBasicMaterial({
  color: 0x7192c9,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});
const oilGlint = new THREE.MeshBasicMaterial({
  color: 0xd9e8ff,
  transparent: true,
  opacity: 0.62,
  depthWrite: false,
});

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

function tube(points: THREE.Vector3[], radius: number): THREE.TubeGeometry {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points),
    Math.max(12, points.length * 4),
    radius,
    6,
    false,
  );
}

/**
 * White missile with red details and the homing red missile with yellow
 * details. The nose points to +Z so the projectile can face its velocity.
 */
function missile(red: boolean): THREE.Group {
  const group = new THREE.Group();
  const paint = outlinedMaterial(red ? COLORS.redMissile : COLORS.missile, 0.0022);
  const detail = outlinedMaterial(red ? COLORS.redMissileDetail : COLORS.missileDetail, 0.0018);
  const metal = outlinedMaterial(0x3a414d, 0.0012);

  const body = new THREE.CylinderGeometry(0.15, 0.16, 0.64, 16, 1);
  body.rotateX(Math.PI / 2);
  mesh(group, body, paint, 0, 0.34, 0);

  const nose = new THREE.ConeGeometry(0.15, 0.32, 16);
  nose.rotateX(Math.PI / 2);
  mesh(group, nose, paint, 0, 0.34, 0.48);

  // Only the very tip is accent-coloured, so the body colour reads at a glance.
  const tip = new THREE.ConeGeometry(0.055, 0.12, 12);
  tip.rotateX(Math.PI / 2);
  mesh(group, tip, detail, 0, 0.34, 0.58);

  const tail = new THREE.CylinderGeometry(0.16, 0.15, 0.08, 16, 1);
  tail.rotateX(Math.PI / 2);
  mesh(group, tail, paint, 0, 0.34, -0.36);

  const nozzle = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 16, 1);
  nozzle.rotateX(Math.PI / 2);
  mesh(group, nozzle, metal, 0, 0.34, -0.435);

  const flame = new THREE.ConeGeometry(0.075, 0.22, 12);
  flame.rotateX(-Math.PI / 2);
  mesh(group, flame, exhaust, 0, 0.34, -0.58);

  // All accents share one mesh to keep held triples cheap to draw.
  const accents: THREE.BufferGeometry[] = [];
  for (const [z, radius] of [[0.1, 0.152], [-0.16, 0.159], [-0.37, 0.157]] as const) {
    accents.push(new THREE.TorusGeometry(radius, z === -0.37 ? 0.02 : 0.023, 8, 28)
      .translate(0, 0.34, z));
  }
  for (let i = 0; i < 4; i++) {
    const angle = i / 4 * Math.PI * 2;
    accents.push(new THREE.BoxGeometry(0.23, 0.03, 0.26)
      .rotateZ(angle)
      .translate(
        Math.cos(angle) * 0.18,
        0.34 + Math.sin(angle) * 0.18,
        -0.25,
      ));
  }
  for (const side of [-1, 1]) {
    accents.push(new THREE.SphereGeometry(0.04, 8, 6)
      .scale(0.28, 0.85, 1.3)
      .translate(side * 0.143, 0.39, 0.16));
  }
  // The eye geometry uses a different material, so merge fins/rings only.
  const painted = accents.slice(0, 7);
  const eyes = mergeGeometries(accents.slice(7), false)!;
  mesh(group, mergeGeometries(painted, false)!, detail);
  mesh(group, eyes, ink);
  for (const geometry of accents) geometry.dispose();

  return group;
}

function oilCan(): THREE.Group {
  const group = new THREE.Group();
  mesh(group, new THREE.CylinderGeometry(0.15, 0.17, 0.44, 14), oilPaint, 0, 0.25, 0);
  mesh(group, new THREE.CylinderGeometry(0.18, 0.18, 0.04, 14), oilMetal, 0, 0.035, 0);
  mesh(group, new THREE.CylinderGeometry(0.17, 0.17, 0.04, 14), oilMetal, 0, 0.465, 0);
  mesh(group, new THREE.CylinderGeometry(0.176, 0.181, 0.2, 14), oilLabel, 0, 0.255, 0);
  mesh(group, new THREE.CylinderGeometry(0.181, 0.181, 0.035, 14), oilMetal, 0, 0.255, 0);

  const spout = tube([
    new THREE.Vector3(0.05, 0.48, 0.1),
    new THREE.Vector3(0.14, 0.58, 0.16),
    new THREE.Vector3(0.24, 0.55, 0.24),
    new THREE.Vector3(0.31, 0.47, 0.31),
  ], 0.032);
  mesh(group, spout, oilMetal);
  mesh(group, new THREE.SphereGeometry(0.043, 8, 6), oilMetal, 0.31, 0.47, 0.31);

  const handle = tube([
    new THREE.Vector3(-0.15, 0.4, 0),
    new THREE.Vector3(-0.28, 0.47, 0),
    new THREE.Vector3(-0.3, 0.3, 0),
    new THREE.Vector3(-0.15, 0.2, 0),
  ], 0.024);
  mesh(group, handle, oilMetal);

  return group;
}

const boltOutline = [
  [-0.04, 0.52], [0.26, 0.06], [0.08, 0.04],
  [0.18, -0.52], [-0.26, 0.02], [-0.06, 0.04],
] as const;

function boltShape(scale: number): THREE.Shape {
  const shape = new THREE.Shape();
  boltOutline.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x * scale, y * scale);
    else shape.lineTo(x * scale, y * scale);
  });
  shape.closePath();
  return shape;
}

function boltGeometry(scale: number, depth: number): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(boltShape(scale), {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.016,
    bevelSegments: 2,
    steps: 1,
  });
  geometry.center();
  geometry.translate(0, 0.52, 0);
  return geometry;
}

/** Stylised three-dimensional lightning bolt used by the boost pickup. */
function lightning(): THREE.Group {
  const group = new THREE.Group();
  mesh(group, boltGeometry(1, 0.12), lightningGold);
  const core = mesh(group, boltGeometry(0.56, 0.02), lightningCore, 0, 0, 0.07);
  core.castShadow = false;
  return group;
}

function puddleGeometry(
  radiusX: number,
  radiusZ: number,
  seed: number,
  wobble = 0.14,
): THREE.BufferGeometry {
  const segments = 32;
  const positions: number[] = [0, 0, 0];
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = i / segments * Math.PI * 2;
    const radius = 1
      + wobble * Math.sin(angle * 3 + seed)
      + 0.07 * Math.sin(angle * 5 + seed * 1.7);
    positions.push(
      Math.cos(angle) * radiusX * radius,
      0,
      Math.sin(angle) * radiusZ * radius,
    );
  }
  for (let i = 0; i < segments; i++) {
    indices.push(0, 1 + (i + 1) % segments, 1 + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Spilled can plus mirror-dark puddle, dropped as the oil-can hazard. */
export function createOilSlickModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = "oil-slick";

  const stain = mesh(group, puddleGeometry(0.82, 0.58, 0.7, 0.1), oilStain, 0, 0.003, 0);
  stain.castShadow = false;
  const puddle = mesh(group, puddleGeometry(0.7, 0.47, 2.1, 0.16), oilBase, 0, 0.007, 0);
  puddle.castShadow = false;

  const sheenA = mesh(group, puddleGeometry(0.34, 0.12, 3.4, 0.2), oilSheen, -0.1, 0.011, 0.04);
  const sheenB = mesh(group, puddleGeometry(0.2, 0.07, 5.2, 0.18), oilSheen, 0.18, 0.011, -0.14);
  const glint = mesh(group, puddleGeometry(0.13, 0.035, 1.8, 0.25), oilGlint, -0.24, 0.013, -0.08);
  sheenA.castShadow = sheenB.castShadow = glint.castShadow = false;

  const holder = new THREE.Group();
  holder.position.set(0.42, 0.17, 0.18);
  holder.rotation.y = 0.42;
  const can = createItemModel("oil-can");
  can.rotation.z = Math.PI / 2;
  holder.add(can);
  group.add(holder);

  return group;
}

const templates = new Map<ItemType, THREE.Group>();

/** Clones own their transforms; immutable geometry and materials stay shared. */
export function createItemModel(type: ItemType): THREE.Group {
  let template = templates.get(type);
  if (!template) {
    switch (type) {
      case "oil-can": template = oilCan(); break;
      case "missile": template = missile(false); break;
      case "red-missile": template = missile(true); break;
      case "lightning": template = lightning(); break;
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
    // Missiles point down the track; the other pickups face the chase camera.
    const baseYaw = item === "missile" || item === "red-missile" ? 0 : Math.PI;
    this.group.children.forEach((model, index) => {
      model.visible = index < visible;
      model.scale.setScalar(visible === 1 ? 0.68 : 0.52);
      model.position.set((index - (visible - 1) / 2) * 0.56,
        Math.sin(this.elapsed * 2.2 + index * 0.6) * 0.035, 0);
      model.rotation.y = baseYaw + Math.sin(this.elapsed * 0.8) * 0.15;
    });
  }
}
