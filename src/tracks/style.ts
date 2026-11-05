import type { TrackStyle } from "./definition";

export const DEFAULT_TRACK_STYLE: TrackStyle = {
  roadColor: 0xeac387,
  grassColor: 0x75c64c,
  startLineColor: 0xf8fafc,
  barrierColors: [0xf15b49, 0x438df0, 0xf5ce45, 0x59c54d],
  mapWallColor: 0x547c49,
  obstacleColor: 0x475569,
  roadThickness: 0.08,
  slabLength: 5.0,
  wallOffset: 6.4,
  wallHeight: 1.2,
  wallThickness: 0.6,
  mapWallHeight: 2.0,
  mapWallThickness: 2.0,
  startLine: {
    width: 12,
    depth: 0.9,
    height: 0.02,
  },
};
