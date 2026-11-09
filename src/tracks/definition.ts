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

/** Ramp aligned with the centerline. `t` is the center and `length` is in meters. */
export interface TrackRampPlacement {
  readonly t: number;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly lateral?: number;
}

/** Elliptical hole in the ice, used for the Lakitu recovery. */
export interface TrackHolePlacement {
  readonly t: number;
  readonly lateral: number;
  readonly radiusX: number;
  readonly radiusZ: number;
}

/** Banked turn: the angle is applied smoothly between `from` and `to`. */
export interface TrackBankPlacement {
  readonly from: number;
  readonly to: number;
  readonly angle: number;
}

/** Floor strip with its own surface, such as the stone of the underground section. */
export interface TrackSurfaceZone {
  readonly from: number;
  readonly to: number;
  readonly surface: Surface;
}

/**
 * Elevated section (overpass): the deck rises for `ramp` meters from `from`,
 * stays at `height`, and descends for `ramp` meters to `to`. It may pass over
 * another section of the track; where there is road below, the span stays clear.
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
  /** Ground undulations outside the corridor; when omitted, the ground is flat. */
  readonly relief?: TerrainRelief;
  /** Visual ground beyond the bounds, up to the horizon; when omitted, it ends at the wall. */
  readonly skirt?: TerrainSkirt;
  /** `false` hides the boundary wall and keeps only the collision. */
  readonly mapWallVisible?: boolean;
  /** Terrain texture outside the track; when omitted, it derives from the base surface. */
  readonly groundFinish?: "grass" | "sand" | "snow" | "stone";
  /** Overpass colors: retaining walls, span girders, and deck walkway. */
  readonly viaduct?: {
    readonly wallColor: number;
    readonly girderColor: number;
    readonly walkwayColor: number;
  };
  /** Ramp finish; the historical default is Vanilla Lake ice. */
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
  /** Surface outside the barriers; the historical default is grass. */
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
