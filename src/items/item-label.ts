import type { ItemType } from "../core/types";

export function itemLabel(
  item: ItemType | null,
  count = 1,
): string {
  let label: string;
  switch (item) {
    case "banana":
      label = "BANANA";
      break;
    case "shell":
      label = "SHELL";
      break;
    case "red-shell":
      label = "RED SHELL";
      break;
    case "mushroom":
      label = "MUSHROOM";
      break;
    default:
      return "—";
  }
  return count > 1 ? `${label} ×${count}` : label;
}
