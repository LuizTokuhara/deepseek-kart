import type { TrackDefinition } from "../../definition";
import { createRoundedTrackCurve } from "../../curves";
import { DEFAULT_TRACK_STYLE } from "../../style";

export const racewayLayout: TrackDefinition = {
  id: "deepseek-raceway",
  name: "Deepseek Raceway",
  curve: createRoundedTrackCurve({
    halfWidth: 65,
    halfDepth: 35,
    cornerRadius: 18,
    chicaneAmplitude: 10,
    straightSample: 4,
    cornerSteps: 8,
  }),
  width: 12,
  sampleStep: 3,
  spawnT: 0.015,
  surface: "dirt",
  checkpointTs: [0.27, 0.52, 0.77],
  checkpointRadius: 7.5,
  itemRows: [0.16, 0.38, 0.6, 0.82].map((t) => ({
    t,
    lateral: [-3.2, 0, 3.2],
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
    width: 260,
    depth: 200,
  },
  style: DEFAULT_TRACK_STYLE,
};
