import * as THREE from "three";
import { GROUND_Y, ITEMS } from "../core/config";
import type { Kart } from "../actors/kart/kart";
import type { TrackLike } from "../tracks/track";
import { createOilSlickModel } from "./item-model";
import { distanceToKartSq, hitKart, sameLevel } from "./item-hit";
import type { ItemEvent, ItemRacer, KartId } from "./item-types";

export interface OilSlick {
  x: number;
  z: number;
  /** Ground height under the slick (the level where it was spilled). */
  y: number;
  mesh: THREE.Group;
  owner: KartId;
  life: number;
  immunity: number;
}

export function spawnOilSlick(
  kart: Kart,
  owner: KartId,
  track: TrackLike,
  group: THREE.Group,
): OilSlick {
  const forwardX = Math.sin(kart.state.yaw);
  const forwardZ = Math.cos(kart.state.yaw);
  const x = kart.state.pos.x - forwardX * 2.0;
  const z = kart.state.pos.z - forwardZ * 2.0;
  const y = track.heightAt?.(x, z, kart.state.height) ?? 0;
  const mesh = createOilSlickModel();
  mesh.position.set(x, GROUND_Y + y + 0.01, z);
  mesh.rotation.y = kart.state.yaw + Math.PI;
  group.add(mesh);

  return {
    x,
    z,
    y,
    mesh,
    owner,
    life: ITEMS.oilSlickLife,
    immunity: ITEMS.oilSlickOwnerImmunity,
  };
}

export function updateOilSlicks(
  oilSlicks: OilSlick[],
  dt: number,
  racers: readonly ItemRacer[],
  track: TrackLike,
  group: THREE.Group,
  events: ItemEvent[],
): void {
  for (let index = oilSlicks.length - 1; index >= 0; index--) {
    const oilSlick = oilSlicks[index];
    oilSlick.life -= dt;
    oilSlick.immunity -= dt;
    oilSlick.y = track.heightAt?.(oilSlick.x, oilSlick.z, oilSlick.y) ?? 0;
    oilSlick.mesh.position.y = GROUND_Y + oilSlick.y + 0.01;

    let hit = false;
    const hitRadius = ITEMS.oilSlickRadius + 0.6;

    for (const racer of racers) {
      if (
        racer.kart.state.spinTimer > 0 ||
        (oilSlick.owner === racer.id && oilSlick.immunity > 0)
      ) {
        continue;
      }

      if (
        sameLevel(oilSlick.y, racer.kart) &&
        distanceToKartSq(oilSlick, racer.kart) <= hitRadius * hitRadius
      ) {
        hitKart(racer.kart, racer.id, "oil-can", events);
        hit = true;
        break;
      }
    }

    if (hit || oilSlick.life <= 0) {
      group.remove(oilSlick.mesh);
      oilSlicks.splice(index, 1);
    }
  }
}
