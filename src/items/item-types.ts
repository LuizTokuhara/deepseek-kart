import type { Kart } from "../actors/kart/kart";
import type { ItemType } from "../core/types";

export type KartId = string;

export type ItemEvent =
  | { type: "pickup"; kart: KartId; item: ItemType; count: number }
  | { type: "use"; kart: KartId; item: ItemType; count: number }
  | { type: "hit"; kart: KartId; item: ItemType };

export interface ItemRoll {
  item: ItemType;
  count: number;
}

export interface ItemRacer {
  id: KartId;
  kart: Kart;
  /** 1 = leader. Used for item odds, AI tactics and shell targeting. */
  rank: number;
  isPlayer: boolean;
  /** False for racers that already finished or are still on the grid. */
  active?: boolean;
}
