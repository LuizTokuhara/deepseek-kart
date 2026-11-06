import * as THREE from "three";
import type { TrackDefinition } from "../../definition";
import { DEFAULT_TRACK_STYLE } from "../../style";

/** Volta de 572 m: largada oeste, travessia norte, saltos leste e slalom sul. */
const curve = new THREE.CatmullRomCurve3(
  [
    [-84, 16], [-84, -14], [-82, -43], [-68, -64], [-44, -75],
    [-16, -77], [14, -77], [42, -70], [66, -53], [77, -30],
    [77, -2], [79, 23], [85, 45], [70, 65], [44, 75],
    [20, 81], [-2, 75], [-25, 74], [-46, 86], [-70, 78],
    [-85, 56], [-85, 35],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
  true,
  "centripetal",
  0.5,
);
curve.arcLengthDivisions = 4000;

export const vanillaLakeLayout: TrackDefinition = {
  id: "vanilla-lake",
  name: "Vanilla Lake",
  curve,
  width: 17,
  sampleStep: 3,
  spawnT: 0.015,
  surface: "ice",
  checkpointTs: [0.275, 0.505, 0.755],
  checkpointRadius: 10,
  itemRows: [0.085, 0.22, 0.43, 0.62, 0.785, 0.955].map((t) => ({
    t,
    lateral: [-4.5, 0, 4.5],
  })),
  // Breakable ice belongs to the decoration lifecycle, not static track geometry.
  obstacles: [],
  wallGaps: [],
  features: {
    banks: [
      { from: 0.105, to: 0.21, angle: -0.17 },
      { from: 0.35, to: 0.46, angle: -0.17 },
      { from: 0.565, to: 0.645, angle: -0.18 },
      { from: 0.742, to: 0.806, angle: 0.12 },
      { from: 0.88, to: 0.96, angle: -0.18 },
    ],
    holes: [
      { t: 0.266, lateral: -3.2, radiusX: 3.3, radiusZ: 2.8 },
      { t: 0.502, lateral: 3.0, radiusX: 3.1, radiusZ: 2.4 },
      { t: 0.550, lateral: -3.0, radiusX: 2.8, radiusZ: 2.2 },
      { t: 0.675, lateral: -4.8, radiusX: 1.7, radiusZ: 2.0 },
      { t: 0.710, lateral: 4.8, radiusX: 1.8, radiusZ: 2.0 },
      { t: 0.850, lateral: 4.6, radiusX: 2.0, radiusZ: 2.7 },
    ],
    ramps: [
      { t: 0.245, length: 10, width: 6.5, height: 1.9, lateral: -3.2 },
      { t: 0.482, length: 9, width: 6.3, height: 1.7, lateral: 3.0 },
      { t: 0.532, length: 7, width: 5.8, height: 1.3, lateral: -3.0 },
    ],
  },
  bounds: { width: 300, depth: 300 },
  style: {
    ...DEFAULT_TRACK_STYLE,
    roadColor: 0xa5dfe9,
    grassColor: 0xf5fcff,
    startLineColor: 0x236c98,
    barrierColors: [0x287bb5, 0xf5fcff, 0xe45c65, 0xf5fcff, 0xf2ca57, 0xf5fcff, 0x53aa91, 0xf5fcff],
    mapWallColor: 0xb3d9e7,
    obstacleColor: 0x8ed6ed,
    wallOffset: 9.2,
    wallHeight: 0.9,
    wallThickness: 0.65,
    mapWallHeight: 2.4,
    mapWallThickness: 2,
    startLine: { ...DEFAULT_TRACK_STYLE.startLine, width: 17 },
  },
};
