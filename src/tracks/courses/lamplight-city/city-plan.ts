import { randomGenerator } from "../../../decor/common";
import { FLOOR_HEIGHT, type BuildingKind, type BuildingLot } from "../../../decor/city/buildings";
import { pathDistance } from "../../relief";
import type { TrackLike } from "../../track";

/** Square or park: axis-aligned rectangle, reserved before the buildings. */
export interface Park {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}

export const PARKS: readonly Park[] = [
  { x: -52, z: 46, width: 44, depth: 34 },
  { x: 46, z: -46, width: 40, depth: 32 },
  { x: 38, z: 38, width: 22, depth: 22 },
];

/** Sidewalk between the barrier and the facades, in meters. */
export const SETBACK = 4.6;

const PALETTES: Record<BuildingKind, readonly number[]> = {
  house: [0xb7846a, 0xd6c3a0, 0x8ea4b4, 0xc49a90, 0x9daf8a, 0xc9b27e],
  shop: [0xc8b597, 0xa88a79, 0x8b97a6, 0xd0a67c, 0x9b8eaf, 0xb9a48e],
  office: [0x7e8695, 0x9aa0aa, 0x6e7e8b, 0xa49a89, 0x5f6a7c, 0x8c8a9c],
};
const ROOFS = [0x7b4a42, 0x5d5f6e, 0x8a5a3c, 0x4d5b66];
const AWNINGS = [0xc8423b, 0x2b8f8a, 0xe0a83a, 0x7a4fa0, 0x3f8f4f, 0xd5677e];

interface Footprint {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly width: number;
  readonly depth: number;
}

const inPark = (x: number, z: number, margin = 0): boolean => PARKS.some((park) =>
  Math.abs(x - park.x) < park.width / 2 + margin && Math.abs(z - park.z) < park.depth / 2 + margin);

function corners(lot: Footprint, grow = 0): [number, number][] {
  const cos = Math.cos(lot.yaw);
  const sin = Math.sin(lot.yaw);
  const hx = lot.width / 2 + grow;
  const hz = lot.depth / 2 + grow;
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) =>
    [lot.x + x * cos + z * sin, lot.z - x * sin + z * cos]);
}

/** Separating Axis Theorem (SAT) between two oriented rectangles. */
function overlaps(a: Footprint, b: Footprint, gap: number): boolean {
  const reach = (Math.hypot(a.width, a.depth) + Math.hypot(b.width, b.depth)) / 2 + gap;
  if (Math.hypot(a.x - b.x, a.z - b.z) > reach) return false;
  const pa = corners(a, gap / 2);
  const pb = corners(b, gap / 2);
  for (const yaw of [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2]) {
    const ax = Math.sin(yaw);
    const az = Math.cos(yaw);
    const project = (points: [number, number][]) => points.map(([x, z]) => x * ax + z * az);
    const ra = project(pa);
    const rb = project(pb);
    if (Math.max(...ra) < Math.min(...rb) || Math.max(...rb) < Math.min(...ra)) return false;
  }
  return true;
}

/** Building type by street: shops at the start, houses to the west and north, towers at the overpass. */
function streetKind(x: number, z: number, random: () => number): BuildingKind {
  if (Math.abs(x) < 12) return "office";
  if (Math.abs(z) < 12 || z < -64) return random() < 0.8 ? "shop" : "office";
  if (x < -44 || z > 64) return random() < 0.75 ? "house" : "shop";
  return random() < 0.5 ? "office" : "shop";
}

function heightFor(kind: BuildingKind, random: () => number, tall: boolean): number {
  if (kind === "house") return 0.5 + (2 + Math.floor(random() * 2)) * FLOOR_HEIGHT.house + 0.4;
  if (kind === "shop") return 4.3 + (1 + Math.floor(random() * 3)) * FLOOR_HEIGHT.shop + 0.7;
  const floors = tall ? 7 + Math.floor(random() * 7) : 3 + Math.floor(random() * 5);
  return 1.1 + floors * FLOOR_HEIGHT.office + 0.7;
}

/**
 * Blocks around the layout: facades facing the streets, a taller
 * second row behind them, and the rest of the map filled in a grid.
 * No lot encroaches on the sidewalk, the parks, or the corridor under the overpass.
 */
export function planCity(track: TrackLike): BuildingLot[] {
  const random = randomGenerator(6151);
  const lots: BuildingLot[] = [];
  const clearance = track.wallOffset + SETBACK;
  const { minX, maxX, minZ, maxZ } = track.bounds;

  const fits = (lot: Footprint): boolean => {
    const points = [...corners(lot), [lot.x, lot.z] as [number, number]];
    for (const [x, z] of corners(lot).map(([x, z], i, all) => {
      const [nx, nz] = all[(i + 1) % 4];
      return [(x + nx) / 2, (z + nz) / 2];
    })) points.push([x, z]);
    return points.every(([x, z]) => x > minX + 1 && x < maxX - 1 && z > minZ + 1 && z < maxZ - 1 &&
      pathDistance(track.path, x, z) >= clearance && !inPark(x, z, 1.5)) &&
      lots.every((other) => !overlaps(lot, other, 1.2));
  };

  const place = (footprint: Footprint, kind: BuildingKind, tall: boolean): boolean => {
    if (!fits(footprint)) return false;
    lots.push({
      ...footprint, kind,
      height: heightFor(kind, random, tall),
      color: PALETTES[kind][Math.floor(random() * PALETTES[kind].length)],
      accent: kind === "house" ? ROOFS[Math.floor(random() * ROOFS.length)]
        : AWNINGS[Math.floor(random() * AWNINGS.length)],
      lit: kind === "house" ? 0.55 : kind === "shop" ? 0.45 : 0.32 + random() * 0.2,
      seed: Math.floor(random() * 997),
    });
    return true;
  };

  // Facing the street, on both sides, advancing along the width of each lot.
  const count = track.path.length;
  for (const side of [-1, 1]) {
    let distance = random() * 4;
    while (distance < count * track.pathSpacing) {
      const index = Math.floor(distance / track.pathSpacing) % count;
      const point = track.path[index];
      const yaw = track.pathYaw(index);
      const kind = streetKind(point.x, point.z, random);
      const width = kind === "house" ? 8 + random() * 3 : 9 + random() * 6;
      const depth = 10 + random() * 5;
      const lateral = side * (clearance + depth / 2 + 0.3);
      const front: Footprint = {
        x: point.x + Math.cos(yaw) * lateral, z: point.z - Math.sin(yaw) * lateral,
        yaw: Math.atan2(-side * Math.cos(yaw), side * Math.sin(yaw)), width, depth,
      };
      if (place(front, kind, false)) {
        // Second row: taller offices behind the facades.
        const backDepth = 10 + random() * 6;
        const back = side * (clearance + depth + 2 + backDepth / 2);
        place({ ...front, x: point.x + Math.cos(yaw) * back, z: point.z - Math.sin(yaw) * back,
          depth: backDepth, width: width + random() * 4 }, "office", random() < 0.6);
      }
      distance += width + 0.8 + random() * 1.6;
    }
  }

  // Grid fill, facing the nearest street.
  for (let x = minX + 9; x < maxX - 6; x += 14) {
    for (let z = minZ + 9; z < maxZ - 6; z += 14) {
      const cx = x + (random() - 0.5) * 5;
      const cz = z + (random() - 0.5) * 5;
      const index = track.nearestPathIndex(cx, cz);
      const street = Math.round(track.pathYaw(index) / (Math.PI / 2)) * (Math.PI / 2);
      const toRoad = Math.atan2(track.path[index].x - cx, track.path[index].z - cz);
      const facing = Math.round((toRoad - street) / (Math.PI / 2)) * (Math.PI / 2) + street;
      const nearBridge = Math.abs(cx) < 45 && Math.abs(cz) < 55;
      const kind: BuildingKind = nearBridge || random() < 0.55 ? "office" : "house";
      place({ x: cx, z: cz, yaw: facing, width: 10 + random() * 6, depth: 10 + random() * 6 },
        kind, nearBridge || random() < 0.3);
    }
  }
  return lots;
}

/** Skyline towers, outside the map, without collision. */
export function planSkyline(): BuildingLot[] {
  const random = randomGenerator(8803);
  const lots: BuildingLot[] = [];
  for (let index = 0; index < 64; index++) {
    const angle = (index / 64) * Math.PI * 2 + random() * 0.05;
    const radius = 150 + random() * 110;
    const height = 22 + random() ** 1.6 * 70;
    lots.push({
      x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
      yaw: Math.round(random() * 4) * (Math.PI / 2) + (random() - 0.5) * 0.3,
      width: 14 + random() * 14, depth: 14 + random() * 12, height,
      kind: "office", color: PALETTES.office[index % PALETTES.office.length],
      lit: 0.25 + random() * 0.25, seed: index * 13,
    });
  }
  return lots;
}
