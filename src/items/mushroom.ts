import { ITEMS } from "../core/config";
import type { Kart } from "../actors/kart/kart";

export function useMushroom(kart: Kart): void {
  kart.state.miniTurboTier = ITEMS.mushroomBoostTier;
  kart.state.miniTurboTimer = ITEMS.mushroomBoostTime;
}
