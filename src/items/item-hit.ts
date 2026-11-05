import { ITEMS } from "../config";
import type { Kart } from "../kart";
import type { ItemType } from "../types";
import type { ItemEvent, KartId } from "./item-types";

/** Applies the shared hit response and records the event for the HUD. */
export function hitKart(
  kart: Kart,
  id: KartId,
  item: ItemType,
  events: ItemEvent[],
): void {
  if (kart.state.spinTimer > 0) {
    return;
  }

  kart.state.vel.x *= ITEMS.hitSpeedScale;
  kart.state.vel.z *= ITEMS.hitSpeedScale;
  kart.state.spinTimer = ITEMS.spinTime;
  kart.state.drifting = false;
  kart.state.driftDirection = 0;
  kart.state.driftCharge = 0;
  kart.state.driftTier = 0;
  kart.state.miniTurboTimer = 0;
  kart.state.miniTurboTier = 0;
  events.push({ type: "hit", kart: id, item });
}

export function distanceToKartSq(
  position: { x: number; z: number },
  kart: Kart,
): number {
  const dx = position.x - kart.state.pos.x;
  const dz = position.z - kart.state.pos.z;
  return dx * dx + dz * dz;
}
