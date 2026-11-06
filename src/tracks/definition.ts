import type * as THREE from "three";
import type { Surface } from "../core/types";
import type { TerrainRelief, TerrainSkirt } from "./relief";

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
  readonly shape?: "box" | "rock" | "ice" | "penguin";
}

/** Rampa alinhada à centerline. `t` é o centro e `length` é em metros. */
export interface TrackRampPlacement {
  readonly t: number;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly lateral?: number;
}

/** Buraco elíptico no gelo, usado para a recuperação do Lakitu. */
export interface TrackHolePlacement {
  readonly t: number;
  readonly lateral: number;
  readonly radiusX: number;
  readonly radiusZ: number;
}

/** Curva inclinada: o ângulo é aplicado suavemente entre `from` e `to`. */
export interface TrackBankPlacement {
  readonly from: number;
  readonly to: number;
  readonly angle: number;
}

/** Faixa de piso com superfície própria, como a pedra do trecho subterrâneo. */
export interface TrackSurfaceZone {
  readonly from: number;
  readonly to: number;
  readonly surface: Surface;
}

/**
 * Trecho elevado (viaduto): o leito sobe por `ramp` metros a partir de `from`,
 * fica em `height` e desce por `ramp` metros até `to`. Pode passar por cima de
 * outro trecho da pista; onde houver estrada embaixo, o vão fica livre.
 */
export interface TrackElevationPlacement {
  readonly from: number;
  readonly to: number;
  readonly height: number;
  readonly ramp: number;
}

export interface TrackFeatures {
  readonly ramps?: readonly TrackRampPlacement[];
  readonly holes?: readonly TrackHolePlacement[];
  readonly banks?: readonly TrackBankPlacement[];
  readonly elevations?: readonly TrackElevationPlacement[];
}

export interface TrackStyle {
  readonly roadColor: number;
  readonly grassColor: number;
  readonly startLineColor: number;
  readonly barrierColors: readonly [number, ...number[]];
  readonly mapWallColor: number;
  readonly obstacleColor: number;
  readonly roadThickness: number;
  readonly slabLength: number;
  readonly wallOffset: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
  readonly mapWallHeight: number;
  readonly mapWallThickness: number;
  /** Ondulações do chão fora do corredor; omitido, o chão é plano. */
  readonly relief?: TerrainRelief;
  /** Chão visual além dos limites, até o horizonte; omitido, termina no muro. */
  readonly skirt?: TerrainSkirt;
  /** `false` esconde o muro de limite e mantém só a colisão. */
  readonly mapWallVisible?: boolean;
  /** Textura do terreno fora da pista; omitido, deriva da superfície base. */
  readonly groundFinish?: "grass" | "sand" | "snow" | "stone";
  /** Cores do viaduto: muros de contenção, vigas do vão livre e calçada do tabuleiro. */
  readonly viaduct?: {
    readonly wallColor: number;
    readonly girderColor: number;
    readonly walkwayColor: number;
  };
  /** Acabamento das rampas; o padrão histórico é o gelo de Vanilla Lake. */
  readonly rampStyle?: {
    readonly color: number;
    readonly finish: "asphalt" | "dirt" | "grass" | "snow" | "ice" | "sand" | "stone";
    readonly edgeColor: number;
    readonly chevronColor: number;
  };
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
  /** Piso fora das barreiras; o padrão histórico é grama. */
  readonly offroadSurface?: Surface;
  readonly surfaceZones?: readonly TrackSurfaceZone[];
  readonly checkpointTs: readonly number[];
  readonly checkpointRadius: number;
  readonly itemRows: readonly TrackItemRow[];
  readonly obstacles: readonly TrackObstaclePlacement[];
  readonly wallGaps: readonly TrackWallGap[];
  readonly features?: TrackFeatures;
  readonly bounds: {
    readonly width: number;
    readonly depth: number;
  };
  readonly style: TrackStyle;
}
