import type { Kart } from "../kart";
import type { ItemType } from "../types";

export type KartId = "player" | "ai";

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
}
