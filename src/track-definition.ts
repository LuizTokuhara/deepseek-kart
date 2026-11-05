import * as THREE from "three";
import { COLORS, ITEMS, RACE, TRACK, TRACK_SHAPE } from "./config";
import type { Surface } from "./types";

export interface TrackShape {
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly cornerRadius: number;
  readonly chicaneAmplitude: number;
  readonly straightSample: number;
  readonly cornerSteps: number;
}

export interface TrackWallGap {
  readonly side: -1 | 1;
  readonly from: number;
  readonly to: number;
}

export interface TrackItemRow {
  readonly t: number;
  readonly lateral: readonly number[];
}

export interface TrackObstaclePlacement {
  readonly t: number;
  readonly side: -1 | 1;
  readonly lateral: number;
  readonly size: number;
}

export interface TrackStyle {
  readonly roadColor: number;
  readonly grassColor: number;
  readonly startLineColor: number;
  readonly roadThickness: number;
  readonly slabLength: number;
  readonly wallOffset: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
  readonly mapWallHeight: number;
  readonly mapWallThickness: number;
  readonly startLine: {
    readonly width: number;
    readonly depth: number;
    readonly height: number;
  };
}

export interface TrackDefinition {
  readonly id: string;
  readonly name: string;
  readonly curve: THREE.CatmullRomCurve3;
  readonly width: number;
  readonly sampleStep: number;
  readonly spawnT: number;
  readonly surface: Surface;
  readonly checkpointTs: readonly number[];
  readonly checkpointRadius: number;
  readonly itemRows: readonly TrackItemRow[];
  readonly obstacles: readonly TrackObstaclePlacement[];
  readonly wallGaps: readonly TrackWallGap[];
  readonly bounds: {
    readonly width: number;
    readonly depth: number;
  };
  readonly style: TrackStyle;
}

/**
 * Retângulo arredondado com uma chicane em S na reta de largada.
 * A curva é fechada; o primeiro ponto fica na reta inferior.
 *
 * Fica em `track-definition.ts` para que novas pistas possam reutilizar o
 * helper ou fornecer qualquer `CatmullRomCurve3` própria.
 */
export function createRoundedTrackCurve(
  shape: TrackShape = TRACK_SHAPE,
): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  const push = (x: number, z: number): void => {
    const last = points[points.length - 1];
    if (last && Math.hypot(last.x - x, last.z - z) < 0.0001) {
      return;
    }
    points.push(new THREE.Vector3(x, 0, z));
  };

  const {
    halfWidth,
    halfDepth,
    cornerRadius,
    chicaneAmplitude,
    straightSample,
    cornerSteps,
  } = shape;

  const straightHalf = halfWidth - cornerRadius;
  const depthHalf = halfDepth - cornerRadius;
  const bottomSteps = Math.ceil((straightHalf * 2) / straightSample);

  // Reta inferior limpa, usada para acelerar e frear.
  for (let i = 0; i <= bottomSteps; i++) {
    const x = -straightHalf + (i / bottomSteps) * straightHalf * 2;
    push(x, -halfDepth);
  }

  // Curva inferior direita: -90° -> 0°.
  for (let i = 1; i <= cornerSteps; i++) {
    const angle = -Math.PI / 2 + (i / cornerSteps) * (Math.PI / 2);
    push(
      straightHalf + Math.cos(angle) * cornerRadius,
      -depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  // Reta direita.
  const sideSteps = Math.ceil((depthHalf * 2) / straightSample);
  for (let i = 1; i <= sideSteps; i++) {
    const z = -depthHalf + (i / sideSteps) * depthHalf * 2;
    push(halfWidth, z);
  }

  // Curva superior direita: 0° -> 90°.
  for (let i = 1; i <= cornerSteps; i++) {
    const angle = (i / cornerSteps) * (Math.PI / 2);
    push(
      straightHalf + Math.cos(angle) * cornerRadius,
      depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  // Reta superior, com a chicane suave.
  for (let i = 1; i <= bottomSteps; i++) {
    const x = straightHalf - (i / bottomSteps) * straightHalf * 2;
    const u = (x + straightHalf) / (straightHalf * 2);
    const offset =
      chicaneAmplitude *
      Math.sin(Math.PI * u) ** 2 *
      Math.sin(2 * Math.PI * u);
    push(x, halfDepth + offset);
  }

  // Curva superior esquerda: 90° -> 180°.
  for (let i = 1; i <= cornerSteps; i++) {
    const angle = Math.PI / 2 + (i / cornerSteps) * (Math.PI / 2);
    push(
      -straightHalf + Math.cos(angle) * cornerRadius,
      depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  // Reta esquerda.
  for (let i = 1; i <= sideSteps; i++) {
    const z = depthHalf - (i / sideSteps) * depthHalf * 2;
    push(-halfWidth, z);
  }

  // Curva inferior esquerda: 180° -> 270°. O ponto final coincide com o
  // primeiro ponto, então ele é omitido para não duplicar a junção fechada.
  for (let i = 1; i < cornerSteps; i++) {
    const angle = Math.PI + (i / cornerSteps) * (Math.PI / 2);
    push(
      -straightHalf + Math.cos(angle) * cornerRadius,
      -depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal", 0.5);
  curve.arcLengthDivisions = 2000;
  return curve;
}

export const DEFAULT_TRACK_STYLE: TrackStyle = {
  roadColor: COLORS.asphalt,
  grassColor: COLORS.grass,
  startLineColor: COLORS.startLine,
  roadThickness: TRACK.roadThickness,
  slabLength: TRACK.slabLength,
  wallOffset: TRACK.wallOffset,
  wallHeight: TRACK.wallHeight,
  wallThickness: TRACK.wallThickness,
  mapWallHeight: TRACK.mapWallHeight,
  mapWallThickness: TRACK.mapWallThickness,
  startLine: {
    width: TRACK.startLineWidth,
    depth: TRACK.startLineDepth,
    height: TRACK.startLineHeight,
  },
};

/**
 * Definição da pista atual. Novas pistas podem fornecer sua própria
 * `TrackDefinition` (curva, largura, checkpoints, itens, limites e estilo).
 */
export const DEFAULT_TRACK_DEFINITION: TrackDefinition = {
  id: "deepseek-raceway",
  name: "Deepseek Raceway",
  curve: createRoundedTrackCurve(),
  width: TRACK.width,
  sampleStep: TRACK.sampleStep,
  spawnT: 0.015,
  surface: "dirt",
  checkpointTs: RACE.checkpointTs,
  checkpointRadius: RACE.checkpointRadius,
  itemRows: ITEMS.boxRows.map((t) => ({
    t,
    lateral: ITEMS.boxLateral,
  })),
  obstacles: [
    { t: 0.335, side: 1, lateral: 9.0, size: 1.4 },
    { t: 0.355, side: 1, lateral: 11.0, size: 1.2 },
    { t: 0.705, side: -1, lateral: 9.0, size: 1.4 },
  ],
  wallGaps: [
    { side: 1, from: 0.30, to: 0.365 },
    { side: -1, from: 0.675, to: 0.74 },
  ],
  bounds: {
    width: TRACK.grassWidth,
    depth: TRACK.grassDepth,
  },
  style: DEFAULT_TRACK_STYLE,
};
