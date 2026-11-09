import type { ItemRoll } from "./item-types";

export function rollItem(
  rank: number,
  random: () => number = Math.random,
): ItemRoll {
  const table: ReadonlyArray<ItemRoll & { weight: number }> =
    rank <= 1
      ? [
          { item: "oil-can", count: 1, weight: 0.26 },
          { item: "oil-can", count: 3, weight: 0.12 },
          { item: "missile", count: 1, weight: 0.26 },
          { item: "missile", count: 3, weight: 0.12 },
          { item: "lightning", count: 1, weight: 0.16 },
          { item: "red-missile", count: 1, weight: 0.08 },
        ]
      : [
          { item: "red-missile", count: 1, weight: 0.18 },
          { item: "red-missile", count: 3, weight: 0.18 },
          { item: "missile", count: 1, weight: 0.16 },
          { item: "missile", count: 3, weight: 0.14 },
          { item: "oil-can", count: 1, weight: 0.12 },
          { item: "oil-can", count: 3, weight: 0.1 },
          { item: "lightning", count: 1, weight: 0.12 },
        ];

  let roll = random();
  for (const entry of table) {
    if (roll < entry.weight) {
      return { item: entry.item, count: entry.count };
    }
    roll -= entry.weight;
  }
  const last = table[table.length - 1];
  return { item: last.item, count: last.count };
}
