import * as THREE from "three";
import { GROUND_Y, ITEMS } from "../config";
import type { Kart } from "../kart";
import { createItemModel } from "./item-model";
import { distanceToKartSq, hitKart } from "./item-hit";
import type { ItemEvent, ItemRacer, KartId } from "./item-types";

export interface Banana {
  x: number;
  z: number;
  mesh: THREE.Group;
  owner: KartId;
  life: number;
  immunity: number;
}

export function spawnBanana(
  kart: Kart,
  owner: KartId,
  group: THREE.Group,
): Banana {
  const forwardX = Math.sin(kart.state.yaw);
  const forwardZ = Math.cos(kart.state.yaw);
  const x = kart.state.pos.x - forwardX * 2.0;
  const z = kart.state.pos.z - forwardZ * 2.0;
  const mesh = createItemModel("banana");
  mesh.position.set(x, GROUND_Y + 0.01, z);
  mesh.rotation.y = kart.state.yaw + Math.PI;
  group.add(mesh);

  return {
    x,
    z,
    mesh,
    owner,
    life: ITEMS.bananaLife,
    immunity: ITEMS.bananaOwnerImmunity,
  };
}

export function updateBananas(
  bananas: Banana[],
  dt: number,
  racers: readonly ItemRacer[],
  group: THREE.Group,
  events: ItemEvent[],
): void {
  for (let index = bananas.length - 1; index >= 0; index--) {
    const banana = bananas[index];
    banana.life -= dt;
    banana.immunity -= dt;

    let hit = false;
    const hitRadius = ITEMS.bananaRadius + 0.6;

    for (const racer of racers) {
      if (
        racer.kart.state.spinTimer > 0 ||
        (banana.owner === racer.id && banana.immunity > 0)
      ) {
        continue;
      }

      if (distanceToKartSq(banana, racer.kart) <= hitRadius * hitRadius) {
        hitKart(racer.kart, racer.id, "banana", events);
        hit = true;
        break;
      }
    }

    if (hit || banana.life <= 0) {
      group.remove(banana.mesh);
      bananas.splice(index, 1);
    }
  }
}
