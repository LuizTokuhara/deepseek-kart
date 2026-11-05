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
  kartRadius: 1.05,
  kartRestitution: 0.2,
  wallRestitution: 0.05,
  wallImpactSlow: 0.25,
  maxSubstep: 0.2,
  hopVelocity: 3.2,
  hopGravity: 18.0,
  driftMinSpeed: 6.0,
  driftCancelSpeed: 3.5,
  driftSteerThreshold: 0.2,
  driftChargeTime: 1.6,
  driftGripScale: 0.45,
  driftTurnScale: 1.0,
  driftSteerBias: 0.25,
  driftSteerWeight: 0.6,
  driftSwitchTime: 0.12,
  overSpeedDecel: 10.0,
  miniTurbo: {
    chargeThresholds: [0.33, 0.66, 0.95],
    durations: [0, 0.45, 0.65, 0.9],
    accel: [0, 8, 11, 14],
    topSpeedBonus: [0, 2.5, 4.0, 5.5],
  },
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
  boostFov: 14,
  boostDistance: 1.4,
  boostLookAhead: 1.5,
  driftYaw: 0.18,
  driftRoll: 0.14,
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

export const RACE = {
  laps: 3,
  checkpointTs: [0.27, 0.52, 0.77],
  checkpointRadius: 7.5,
  countdown: 3.0,
  goDisplay: 0.9,
  resultsDelay: 0.9,
  wrongWayMinSpeed: 4.0,
  wrongWayDot: -0.45,
  wrongWayTime: 0.7,
} as const;

export const AI = {
  targetSpeed: 16.0,
  steerGain: 2.2,
  lookAheadSeconds: 1.0,
  laneOffset: 2.5,
  stuckResetTime: 3.0,
  driftLookAhead: 4,
  driftEnterAngle: 0.22,
  driftExitAngle: 0.12,
  driftMinSpeed: 7.0,
  bananaLookAhead: 14.0,
  bananaClearance: 3.0,
  bananaAvoidOffset: 3.0,
  maxLaneOffset: 4.4,
  rubberBandDistance: 25.0,
  rubberBandSlow: 0.94,
  rubberBandBoost: 1.07,
  paceScaleMin: 0.9,
  paceScaleMax: 1.1,
  mistakeInterval: 18.0,
  mistakeDuration: 0.4,
  mistakeThrottleScale: 0.35,
} as const;

export const ITEMS = {
  boxRows: [0.16, 0.38, 0.6, 0.82],
  boxLateral: [-3.2, 0, 3.2],
  boxRespawn: 3.0,
  boxRadius: 1.1,
  bananaRadius: 0.75,
  bananaLife: 20.0,
  bananaOwnerImmunity: 0.7,
  shellRadius: 0.45,
  shellSpeed: 26.0,
  shellLife: 3.0,
  shellBounce: 0.78,
  shellOwnerImmunity: 0.2,
  redShellSpeed: 30.0,
  redShellLife: 4.5,
  redShellDirectRange: 9.0,
  spinTime: 1.0,
  hitSpeedScale: 0.35,
  mushroomBoostTier: 2,
  mushroomBoostTime: 1.1,
  aiUseTime: 1.0,
  aiBananaDropDistance: 16.0,
  aiBananaBehindDot: -0.2,
  aiBananaHoldTime: 8.0,
  aiShellRange: 32.0,
  aiShellAimDot: 0.94,
  aiMushroomLookAhead: 4,
  aiMushroomStraightAngle: 0.09,
} as const;

export const COLORS = {
  background: 0x7ccce9,
  grass: 0x75c64c,
  asphalt: 0xeac387,
  wall: 0xf2a03b,
  kart: 0x22c6da,
  aiKart: 0xeb4a3d,
  kartNose: 0xf8fafc,
  kartWheel: 0x0f172a,
  startLine: 0xf8fafc,
  itemBox: 0xfacc15,
  banana: 0xfde047,
  shell: 0x22c55e,
  redShell: 0xef4444,
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
