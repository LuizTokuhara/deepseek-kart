import * as THREE from "three";
import type { TrackDefinition } from "../../definition";
import { DEFAULT_TRACK_STYLE } from "../../style";

/**
 * Volta de ~597 m: reta da esfinge ao sul, varredura leste, laço interno
 * ao redor da pirâmide central e retorno pelo túnel de pedra ao norte.
 * O trecho enterrado usa `surfaceZones` para trocar o piso sem bifurcar a
 * pista; a mesma faixa alimenta física, HUD, áudio e efeitos.
 */
const curve = new THREE.CatmullRomCurve3(
  [
    [-59.5, 73], [-25.5, 80], [10, 78], [42.5, 69.5],
    [64.5, 51], [68, 29], [52.5, 17],
    [35.5, 22], [22, 12], [24, -7], [37.5, -19],
    [54.5, -15], [66.5, -29],
    [63, -46], [49.5, -58], [32.5, -66.5],
    [15, -73], [-7, -75], [-29, -73], [-49.5, -68],
    [-64.5, -56], [-76.5, -39], [-81.5, -18.5],
    [-78, 3.5], [-68, 24], [-71.5, 42.5], [-78, 59.5],
    [-73, 71.5],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
  true,
  "centripetal",
  0.5,
);
curve.arcLengthDivisions = 4000;

/** Portais do túnel, medidos na centerline. */
export const sunstoneTunnel = { from: 0.5723, to: 0.7131 } as const;

const ramps = [
  { t: 0.16, length: 8, width: 6, height: 1.4, lateral: -3.2 },
  { t: 0.455, length: 7.5, width: 5.6, height: 1.25, lateral: 3 },
];

export const sunstoneRuinsLayout: TrackDefinition = {
  id: "sunstone-ruins",
  name: "Sunstone Ruins",
  curve,
  width: 16,
  sampleStep: 3,
  spawnT: 0.012,
  surface: "dirt",
  offroadSurface: "sand",
  surfaceZones: [
    { from: sunstoneTunnel.from, to: sunstoneTunnel.to, surface: "stone" },
  ],
  checkpointTs: [0.22, 0.45, 0.76],
  checkpointRadius: 10,
  itemRows: [0.065, 0.18, 0.33, 0.47, 0.63, 0.78, 0.92].map((t) => ({
    t,
    lateral: [-4.2, 0, 4.2],
  })),
  obstacles: [],
  // O corredor de pedra substitui as barreiras coloridas dentro do túnel.
  wallGaps: [
    { side: -1, from: 0.567, to: 0.718 },
    { side: 1, from: 0.567, to: 0.718 },
  ],
  features: {
    banks: [
      { from: 0.2, to: 0.29, angle: 0.16 },
      { from: 0.32, to: 0.4, angle: -0.16 },
      { from: 0.48, to: 0.56, angle: 0.15 },
      { from: 0.855, to: 0.945, angle: -0.12 },
    ],
    ramps,
  },
  bounds: { width: 320, depth: 320 },
  style: {
    ...DEFAULT_TRACK_STYLE,
    // Terra batida mais escura que a areia, para a pista não se perder nas dunas.
    roadColor: 0xbf9363,
    grassColor: 0xe9c983,
    startLineColor: 0x1d7477,
    barrierColors: [0x1d7477, 0xf2d37e, 0xc05c38, 0xf2d37e],
    mapWallColor: 0xc99a52,
    obstacleColor: 0x9a7547,
    roadThickness: 0.09,
    slabLength: 4.6,
    wallOffset: 9.2,
    wallHeight: 1,
    wallThickness: 0.7,
    mapWallHeight: 2.4,
    mapWallThickness: 2,
    groundFinish: "sand",
    rampStyle: {
      color: 0xb98a4e,
      finish: "stone",
      edgeColor: 0xf2d37e,
      chevronColor: 0x1d7477,
    },
    startLine: { ...DEFAULT_TRACK_STYLE.startLine, width: 16 },
  },
};
