import type { ItemRoll } from "./item-types";

export function rollItem(
  rank: number,
  random: () => number = Math.random,
): ItemRoll {
  const table: ReadonlyArray<ItemRoll & { weight: number }> =
    rank <= 1
      ? [
          { item: "banana", count: 1, weight: 0.26 },
          { item: "banana", count: 3, weight: 0.12 },
          { item: "shell", count: 1, weight: 0.26 },
          { item: "shell", count: 3, weight: 0.12 },
          { item: "mushroom", count: 1, weight: 0.16 },
          { item: "red-shell", count: 1, weight: 0.08 },
        ]
      : [
          { item: "red-shell", count: 1, weight: 0.18 },
          { item: "red-shell", count: 3, weight: 0.18 },
          { item: "shell", count: 1, weight: 0.16 },
          { item: "shell", count: 3, weight: 0.14 },
          { item: "banana", count: 1, weight: 0.12 },
          { item: "banana", count: 3, weight: 0.1 },
          { item: "mushroom", count: 1, weight: 0.12 },
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
