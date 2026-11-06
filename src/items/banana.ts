import * as THREE from "three";
import { GROUND_Y, ITEMS } from "../core/config";
import type { Kart } from "../actors/kart/kart";
import type { TrackLike } from "../tracks/track";
import { createItemModel } from "./item-model";
import { distanceToKartSq, hitKart, sameLevel } from "./item-hit";
import type { ItemEvent, ItemRacer, KartId } from "./item-types";

export interface Banana {
  x: number;
  z: number;
  /** Altura do chão sob a banana (o nível em que ela ficou). */
  y: number;
  mesh: THREE.Group;
  owner: KartId;
  life: number;
  immunity: number;
}

export function spawnBanana(
  kart: Kart,
  owner: KartId,
  track: TrackLike,
  group: THREE.Group,
): Banana {
  const forwardX = Math.sin(kart.state.yaw);
  const forwardZ = Math.cos(kart.state.yaw);
  const x = kart.state.pos.x - forwardX * 2.0;
  const z = kart.state.pos.z - forwardZ * 2.0;
  const y = track.heightAt?.(x, z, kart.state.height) ?? 0;
  const mesh = createItemModel("banana");
  mesh.position.set(x, GROUND_Y + y + 0.01, z);
  mesh.rotation.y = kart.state.yaw + Math.PI;
  group.add(mesh);

  return {
    x,
    z,
    y,
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
  track: TrackLike,
  group: THREE.Group,
  events: ItemEvent[],
): void {
  for (let index = bananas.length - 1; index >= 0; index--) {
    const banana = bananas[index];
    banana.life -= dt;
    banana.immunity -= dt;
    banana.y = track.heightAt?.(banana.x, banana.z, banana.y) ?? 0;
    banana.mesh.position.y = GROUND_Y + banana.y + 0.01;

    let hit = false;
    const hitRadius = ITEMS.bananaRadius + 0.6;

    for (const racer of racers) {
      if (
        racer.kart.state.spinTimer > 0 ||
        (banana.owner === racer.id && banana.immunity > 0)
      ) {
        continue;
      }

      if (
        sameLevel(banana.y, racer.kart) &&
        distanceToKartSq(banana, racer.kart) <= hitRadius * hitRadius
      ) {
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
