import * as THREE from "three";
import { COLORS } from "../core/config";
import type { ItemType } from "../core/types";
import { lightningModel } from "./models/lightning-model";
import { MISSILE_FLAME, missileModel } from "./models/missile-model";
import { oilCanModel } from "./models/oil-can-model";

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
  // Tipped over with the spout lying along the ground, not pointing up.
  can.rotation.set(0, -Math.PI / 2, Math.PI / 2, "ZYX");
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
      case "oil-can": template = oilCanModel(); break;
      case "missile": template = missileModel(false); break;
      case "red-missile": template = missileModel(true); break;
      case "lightning": template = lightningModel(); break;
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
      if (item) {
        for (let i = 0; i < 3; i++) {
          const model = createItemModel(item);
          // A held missile is not lit yet.
          const flame = model.getObjectByName(MISSILE_FLAME);
          if (flame) flame.visible = false;
          this.group.add(model);
        }
      }
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
