export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;
export const MAX_FRAME_DT = 0.25;

/** Altura da superfície dirigível (topo das lajes de asfalto). */
export const GROUND_Y = 0.08;

export const PHYSICS = {
  topSpeed: 22.0, // 79,2 km/h
  reverseSpeed: 6.0,
  accelBands: [13.0, 12.5, 12.0, 11.0, 9.5, 8.0, 6.5, 5.0, 4.0, 3.0],
  brakeDecel: 18.0,
  reverseAccel: 8.0,
  coastDrag: 0.08,
  rollingResistance: 0.5,
  maxTurnRate: 1.8,
  turnSpeedRef: 6.0,
  turnSpeedFalloff: 0.3,
  steerSmooth: 8.0,
  gripAsphalt: 12.0,
  gripGrass: 3.5,
  surfaceBlend: 5.0,
  grassAccelScale: 0.65,
  grassExtraDrag: 0.08,
  grassExtraRolling: 1.8,
  collisionRadius: 0.75,
  capsuleOffset: 0.55,
  wallRestitution: 0.05,
  wallImpactSlow: 0.25,
  maxSubstep: 0.2,
} as const;

export const CAMERA = {
  distance: 6.5,
  height: 2.8,
  lookAhead: 9.0,
  lookHeight: 0.8,
  positionLambda: 8.0,
  lookLambda: 12.0,
  baseFov: 62,
  speedFov: 8,
  collisionMargin: 0.35,
  minDistance: 0.8,
} as const;

export const TRACK = {
  width: 12,
  roadThickness: 0.08,
  sampleStep: 3,
  slabLength: 5.0,
  wallThickness: 0.6,
  wallHeight: 1.2,
  wallLength: 5.0,
  wallOffset: 6.4,
  grassWidth: 260,
  grassDepth: 200,
  mapWallHeight: 2.0,
  mapWallThickness: 2.0,
  startLineWidth: 12,
  startLineDepth: 0.9,
  startLineHeight: 0.02,
} as const;

export const COLORS = {
  background: 0x0b1020,
  grass: 0x17301f,
  asphalt: 0x343a46,
  wall: 0xf97316,
  kart: 0x22d3ee,
  kartNose: 0xf8fafc,
  kartWheel: 0x0f172a,
  startLine: 0xf8fafc,
} as const;

/**
 * Retângulo arredondado: duas retas longas, quatro curvas de raio conhecido
 * e uma chicane suave na reta de largada. A pista é gerada por amostragem.
 */
export const TRACK_SHAPE = {
  halfWidth: 65,
  halfDepth: 35,
  cornerRadius: 18,
  chicaneAmplitude: 10,
  straightSample: 4,
  cornerSteps: 8,
} as const;
