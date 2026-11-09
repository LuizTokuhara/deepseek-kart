import { createFilletedCurve, curveTAt } from "../../curves";
import type { TrackDefinition } from "../../definition";
import { DEFAULT_TRACK_STYLE } from "../../style";

/**
 * Urban figure eight of ~526 m. The start is on the east–west avenue, which passes under
 * the north–south avenue overpass; the southwest loop turns left and the
 * northeast loop turns right, with 16 m radius corners between the blocks.
 */
export const STREET_CORNERS = [
  [52, 0], [-56, 0], [-56, -76], [0, -76], [0, 76], [76, 76], [76, 0],
] as const;

const curve = createFilletedCurve(STREET_CORNERS, 16);
const tAt = (x: number, z: number): number => curveTAt(curve, x, z);

/** North–south avenue overpass: 44 m ramps and a clear span over the start. */
export const lamplightOverpass = {
  from: tAt(0, -58),
  to: tAt(0, 58),
  height: 5.5,
  ramp: 44,
} as const;

const itemSpots = [[24, 0], [-56, -26], [-28, -76], [0, -40], [0, 36], [28, 76], [76, 38]];

export const lamplightCityLayout: TrackDefinition = {
  id: "lamplight-city",
  name: "Lamplight City",
  curve,
  width: 14,
  sampleStep: 3,
  spawnT: 0.015,
  surface: "asphalt",
  offroadSurface: "stone",
  checkpointTs: [tAt(-56, -41), tAt(0, -26), tAt(50, 76)],
  checkpointRadius: 10,
  itemRows: itemSpots.map(([x, z]) => ({ t: tAt(x, z), lateral: [-4.4, 0, 4.4] })),
  obstacles: [],
  wallGaps: [],
  features: { elevations: [lamplightOverpass] },
  bounds: { width: 240, depth: 232 },
  style: {
    ...DEFAULT_TRACK_STYLE,
    roadColor: 0x70737d,
    grassColor: 0x8e8b92,
    startLineColor: 0xf3f1ea,
    barrierColors: [0xd2473d, 0xe6e2da],
    mapWallColor: 0x5b5d66,
    obstacleColor: 0x5b5d66,
    wallOffset: 8,
    wallHeight: 1.1,
    wallThickness: 0.6,
    mapWallHeight: 3,
    // Buildings surround the map; the boundary wall only handles collision.
    mapWallVisible: false,
    groundFinish: "stone",
    skirt: { width: 200, rise: 3 },
    viaduct: { wallColor: 0x8c8a93, girderColor: 0x3b6a80, walkwayColor: 0xa4a09a },
    startLine: { ...DEFAULT_TRACK_STYLE.startLine, width: 14 },
  },
};
