export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;
export const MAX_FRAME_DT = 0.25;

/** Altura da superfície dirigível (topo das lajes de asfalto). */
export const GROUND_Y = 0.08;

/** Centros de contato dos pneus, no espaço local do modelo (+Z à frente). */
export const KART_WHEEL_CONTACTS = [
  { x: -0.65, z: 0.73 },
  { x: 0.65, z: 0.73 },
  { x: -0.73, z: -0.7 },
  { x: 0.73, z: -0.7 },
] as const;

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
  gripIce: 2.8,
  gripStone: 10.4,
  surfaceBlend: 5.0,
  grassAccelScale: 0.65,
  grassExtraDrag: 0.08,
  grassExtraRolling: 1.8,
  iceAccelScale: 0.93,
  iceExtraDrag: 0.015,
  iceExtraRolling: 0.08,
  stoneAccelScale: 0.97,
  stoneExtraDrag: 0.012,
  stoneExtraRolling: 0.35,
  collisionRadius: 0.75,
  /** Altura do corpo do kart: colisores e karts fora desta faixa não o tocam. */
  kartHeight: 1.4,
  /** Desnível que tira o kart do chão em vez de assentá-lo de uma vez. */
  ledgeDrop: 1.5,
  /**
   * Diferença de altura entre dois níveis (viaduto e estrada de baixo): karts e
   * itens mais distantes que isso não interagem. Maior que qualquer salto.
   */
  levelGap: 4,
  capsuleOffset: 0.55,
  kartRadius: 1.05,
  kartRestitution: 0.2,
  wallRestitution: 0.05,
  wallImpactSlow: 0.25,
  maxSubstep: 0.2,
  hopVelocity: 3.2,
  hopGravity: 18.0,
  rampLaunchScale: 1.25,
  fallGravity: 26.0,
  fallDuration: 1.15,
  fallDepth: 5.2,
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

export const RACE = {
  laps: 3,
  opponents: 4,
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
  oilSlickLookAhead: 14.0,
  oilSlickClearance: 3.0,
  oilSlickAvoidOffset: 3.0,
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
  boxRespawn: 3.0,
  boxRadius: 1.1,
  oilSlickRadius: 0.8,
  oilSlickLife: 20.0,
  oilSlickOwnerImmunity: 0.7,
  missileRadius: 0.45,
  missileSpeed: 26.0,
  missileLife: 3.0,
  missileBounce: 0.78,
  missileOwnerImmunity: 0.2,
  redMissileSpeed: 30.0,
  redMissileLife: 4.5,
  redMissileDirectRange: 9.0,
  spinTime: 1.0,
  hitSpeedScale: 0.35,
  lightningBoostTier: 2,
  lightningBoostTime: 1.1,
  aiUseTime: 1.0,
  aiOilSlickDropDistance: 16.0,
  aiOilSlickBehindDot: -0.2,
  aiOilSlickHoldTime: 8.0,
  aiMissileRange: 32.0,
  aiMissileAimDot: 0.94,
  aiLightningLookAhead: 4,
  aiLightningStraightAngle: 0.09,
} as const;

export const COLORS = {
  kart: 0x22c6da,
  aiKart: 0xeb4a3d,
  kartNose: 0xf8fafc,
  kartWheel: 0x0f172a,
  itemBox: 0xfacc15,
  oilCan: 0xf0b429,
  oilSlick: 0x12161d,
  missile: 0xfff6e8,
  redMissile: 0xef4444,
  missileDetail: 0xef4b42,
  redMissileDetail: 0xffd23f,
  lightning: 0xffd23f,
} as const;
