import { isTouchDevice } from "./platform";

export type VisualQualityPreset = "high" | "low";

/**
 * Rendering and scenery budget. Gameplay geometry (road, walls, item boxes,
 * obstacles and their colliders) is never reduced; these values only remove
 * visual density and expensive screen-space work.
 */
export interface VisualQuality {
  readonly preset: VisualQualityPreset;
  /** Probability multiplier for decorative scatter layers. */
  readonly sceneryDensity: number;
  /** Multiplies path-driven decoration intervals: 2 means half the props. */
  readonly sceneryStride: number;
  readonly backdropPeaks: number;
  readonly cloudDensity: number;
  /** Scales the distance where grass chunks stop drawing. */
  readonly groundCoverDistanceScale: number;
  readonly skylineDensity: number;
  readonly cityGridSpacingScale: number;
  readonly buildingDetail: number;
  readonly streetLightSpacingScale: number;
  /** Number of real point lights in the night-city light rig. */
  readonly lightRigCount: number;
  readonly snowfallDensity: number;
  readonly particleDensity: number;
  readonly shadowMapSize: number;
  readonly msaa: number;
  readonly ambientOcclusion: boolean;
  readonly maxPixelRatio: number;
  readonly pixelBudget: number;
}

export const HIGH_QUALITY: VisualQuality = Object.freeze({
  preset: "high",
  sceneryDensity: 1,
  sceneryStride: 1,
  backdropPeaks: 22,
  cloudDensity: 1,
  groundCoverDistanceScale: 1,
  skylineDensity: 1,
  cityGridSpacingScale: 1,
  buildingDetail: 1,
  streetLightSpacingScale: 1,
  lightRigCount: 8,
  snowfallDensity: 1,
  particleDensity: 1,
  shadowMapSize: 2048,
  msaa: 4,
  ambientOcclusion: true,
  maxPixelRatio: 2,
  pixelBudget: 1920 * 1080,
});

export const LOW_QUALITY: VisualQuality = Object.freeze({
  preset: "low",
  sceneryDensity: 0.55,
  sceneryStride: 2,
  backdropPeaks: 15,
  cloudDensity: 0.55,
  groundCoverDistanceScale: 0.72,
  skylineDensity: 0.58,
  cityGridSpacingScale: 1.4,
  buildingDetail: 0.25,
  streetLightSpacingScale: 1.35,
  lightRigCount: 4,
  snowfallDensity: 0.45,
  particleDensity: 0.55,
  shadowMapSize: 1024,
  // WebGPU accepts 1 or 4 samples; 1 skips the mobile resolve entirely.
  msaa: 1,
  ambientOcclusion: false,
  maxPixelRatio: 1.5,
  pixelBudget: 1280 * 720,
});

export function createVisualQuality(preset: VisualQualityPreset): VisualQuality {
  return preset === "low" ? LOW_QUALITY : HIGH_QUALITY;
}

/** Pure query resolver used by tests and by the browser bootstrap. */
export function qualityPresetFor(
  search: string,
  touchDevice: boolean,
): VisualQualityPreset {
  const forced = new URLSearchParams(search).get("quality");
  if (forced === "low" || forced === "high") return forced;
  return touchDevice ? "low" : "high";
}

function currentPreset(): VisualQualityPreset {
  if (typeof window === "undefined") return "high";
  return qualityPresetFor(window.location.search, isTouchDevice());
}

/** Evaluated once per page; mobile automatically starts in the low preset. */
export const VISUAL_QUALITY: VisualQuality = createVisualQuality(currentPreset());
