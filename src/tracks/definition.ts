import type * as THREE from "three";
import type { Surface } from "../core/types";

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

export interface TrackFeatures {
  readonly ramps?: readonly TrackRampPlacement[];
  readonly holes?: readonly TrackHolePlacement[];
  readonly banks?: readonly TrackBankPlacement[];
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
  readonly features?: TrackFeatures;
  readonly bounds: {
    readonly width: number;
    readonly depth: number;
  };
  readonly style: TrackStyle;
}
