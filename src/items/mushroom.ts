import { ITEMS } from "../config";
import type { Kart } from "../kart";

export function useMushroom(kart: Kart): void {
  kart.state.miniTurboTier = ITEMS.mushroomBoostTier;
  kart.state.miniTurboTimer = ITEMS.mushroomBoostTime;
}
