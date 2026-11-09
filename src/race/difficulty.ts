import { AI } from "../core/config";
import { clamp } from "../core/math";

/** Race difficulty chosen on the start screen. */
export type Difficulty = "normal" | "hard";

export const DEFAULT_DIFFICULTY: Difficulty = "normal";

/**
 * Pace multiplier from the player/CPU progress gap. In normal mode a CPU
 * ahead of the player eases off; in hard mode a leader always keeps its pace.
 */
export function paceScaleForGap(
  gap: number,
  paceBias: number,
  difficulty: Difficulty,
): number {
  const normal = difficulty === "normal";
  const catchUp = gap > AI.rubberBandDistance;
  const easeOff = normal && gap < -AI.rubberBandDistance;
  const scale = catchUp ? AI.rubberBandBoost : easeOff ? AI.rubberBandSlow : 1;
  const base = normal ? AI.normalPaceScale : 1;
  const minimum = normal ? AI.paceScaleMin : 1;

  return clamp(base * scale * paceBias, minimum, AI.paceScaleMax);
}
