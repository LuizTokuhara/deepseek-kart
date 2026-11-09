import * as THREE from "three";
import { GROUND_Y, ITEMS, PHYSICS } from "../core/config";
import type { Kart } from "../actors/kart/kart";
import type { TrackLike } from "../tracks/track";
import { ITEM_BOX_MATERIAL } from "./item-box-visual";
import { rollItem } from "./item-roll";
import type { ItemEvent, KartId } from "./item-types";

export interface ItemBox {
  x: number;
  z: number;
  /** Ground height under the box: only karts on this level pick it up. */
  level: number;
  baseY: number;
  mesh: THREE.Mesh;
  active: boolean;
  respawn: number;
}

const BOX_GEOMETRY = new THREE.BoxGeometry(0.9, 0.9, 0.9);

export function createItemBoxes(
  track: TrackLike,
  group: THREE.Group,
): ItemBox[] {
  const boxes: ItemBox[] = [];

  for (const spawn of track.itemBoxes) {
    const mesh = new THREE.Mesh(BOX_GEOMETRY, ITEM_BOX_MATERIAL);
    const level = track.heightAt?.(spawn.x, spawn.z) ?? 0;
    const baseY = GROUND_Y + level + 0.75;
    mesh.position.set(spawn.x, baseY, spawn.z);
    mesh.rotation.set(0.14, 0, 0.18);
    group.add(mesh);
    boxes.push({
      x: spawn.x,
      z: spawn.z,
      level,
      baseY,
      mesh,
      active: true,
      respawn: 0,
    });
  }

  return boxes;
}

export function resetItemBoxes(boxes: readonly ItemBox[]): void {
  for (const box of boxes) {
    box.active = true;
    box.respawn = 0;
    box.mesh.visible = true;
  }
}

export function updateItemBoxes(
  boxes: readonly ItemBox[],
  dt: number,
  elapsed: number,
): void {
  for (let index = 0; index < boxes.length; index++) {
    const box = boxes[index];
    if (!box.active) {
      box.respawn -= dt;
      box.mesh.visible = false;
      if (box.respawn <= 0) {
        box.active = true;
        box.mesh.visible = true;
      }
      continue;
    }

    box.mesh.rotation.y += dt * 1.7;
    box.mesh.position.y = box.baseY + Math.sin(elapsed * 2.2 + index) * 0.05;
  }
}

export function tryPickup(
  boxes: readonly ItemBox[],
  kart: Kart,
  id: KartId,
  rank: number,
  events: ItemEvent[],
): boolean {
  if (
    kart.state.item !== null ||
    kart.state.spinTimer > 0 ||
    kart.state.falling
  ) {
    return false;
  }

  for (const box of boxes) {
    if (!box.active) {
      continue;
    }

    const dx = kart.state.pos.x - box.x;
    const dz = kart.state.pos.z - box.z;
    if (
      dx * dx + dz * dz > ITEMS.boxRadius * ITEMS.boxRadius ||
      Math.abs(kart.state.height - box.level) > PHYSICS.levelGap
    ) {
      continue;
    }

    const roll = rollItem(rank);
    kart.state.item = roll.item;
    kart.state.itemCount = roll.count;
    box.active = false;
    box.respawn = ITEMS.boxRespawn;
    box.mesh.visible = false;
    events.push({
      type: "pickup",
      kart: id,
      item: roll.item,
      count: roll.count,
    });
    return true;
  }

  return false;
}
