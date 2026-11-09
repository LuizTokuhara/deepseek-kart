import type { ItemType } from "../core/types";

export function itemHitLabel(item: ItemType): string {
  return item === "oil-can" ? "OIL SLICK" : itemLabel(item);
}

export function itemLabel(
  item: ItemType | null,
  count = 1,
): string {
  let label: string;
  switch (item) {
    case "oil-can":
      label = "OIL CAN";
      break;
    case "missile":
      label = "MISSILE";
      break;
    case "red-missile":
      label = "RED MISSILE";
      break;
    case "lightning":
      label = "LIGHTNING";
      break;
    default:
      return "—";
  }
  return count > 1 ? `${label} ×${count}` : label;
}
