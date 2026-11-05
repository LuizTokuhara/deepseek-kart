import type { TrackDefinition } from "../../definition";
import { createRoundedTrackCurve } from "../../curves";
import { DEFAULT_TRACK_STYLE } from "../../style";

export const meadowLayout: TrackDefinition = {
  id: "meadow-loop",
  name: "Meadow Loop",
  curve: createRoundedTrackCurve({
    halfWidth: 48, halfDepth: 38, cornerRadius: 24,
    chicaneAmplitude: 0, straightSample: 4, cornerSteps: 12,
  }),
  width: 12,
  sampleStep: 3,
  spawnT: 0.015,
  surface: "asphalt",
  checkpointTs: [0.27, 0.52, 0.77],
  checkpointRadius: 7.5,
  itemRows: [0.17, 0.4, 0.63, 0.84].map((t) => ({ t, lateral: [-3.2, 0, 3.2] })),
  obstacles: [],
  wallGaps: [],
  bounds: { width: 220, depth: 200 },
  style: {
    ...DEFAULT_TRACK_STYLE,
    roadColor: 0x647586,
    grassColor: 0x7cbc62,
    barrierColors: [0x3e8dd4, 0xfff3d6],
  },
};
