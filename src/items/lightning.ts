import { ITEMS } from "../core/config";
import type { Kart } from "../actors/kart/kart";

export function useLightning(kart: Kart): void {
  kart.state.miniTurboTier = ITEMS.lightningBoostTier;
  kart.state.miniTurboTimer = ITEMS.lightningBoostTime;
}
