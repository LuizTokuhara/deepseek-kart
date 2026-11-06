export type { Decoration, DecorationFrame } from "./types";
export { RaceDecor, type RaceDecorOptions } from "./race/race-decor";
export { buildTrees, type TreeSpot } from "./nature/trees";
export { buildSnowPines, type SnowPineSpot } from "./nature/snow-pines";
export { buildHills, type HillSpot } from "./nature/hills";
export { buildClouds, type CloudSpot } from "./nature/clouds";
export {
  buildSnowmen,
  buildIceBlocks,
  buildIceCrystals,
  buildSnowDrifts,
  createFrozenPond,
  createTracksideBoard,
  type SnowmanSpot,
  type IceBlockSpot,
  type IceCrystalSpot,
} from "./props/ice-props";
export { createPalmBatches, createGroundPlantBatches } from "./nature/palms";
export { createLagoon, type LagoonResult } from "./nature/lagoon";
export { createVolcano, type VolcanoResult } from "./nature/volcano";
export { createGrandstand, type GrandstandOptions, type GrandstandResult } from "./props/grandstand";
export { createBalloon } from "./props/balloon";
export { signMaterial } from "./props/signs";
export { createBackdrop } from "./nature/backdrop";
export { createGardenPavilion } from "./props/garden-pavilion";
export { createCourseEdging } from "./race/course-edging";
