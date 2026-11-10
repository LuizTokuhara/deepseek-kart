const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Wraps an angle to [-180, 180). */
export function wrapDegrees(angle: number): number {
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

/**
 * Roll of the phone around its screen normal, in degrees.
 *
 * DeviceOrientation's beta/gamma describe how gravity sits in the device frame.
 * Using gravity instead of a raw Euler angle keeps the neutral position valid
 * in both landscape orientations, where beta/gamma swap roles. Rolling the
 * phone counter-clockwise (as seen by the player) makes the result decrease.
 */
export function gravityRollDegrees(beta: number, gamma: number): number {
  const b = beta * DEG_TO_RAD;
  const g = gamma * DEG_TO_RAD;
  const gravityX = Math.sin(g) * Math.cos(b);
  const gravityY = -Math.sin(b);
  return Math.atan2(gravityX, -gravityY) * RAD_TO_DEG;
}

export interface TiltSteeringOptions {
  /** Tilt in degrees for a full steering lock. */
  rangeDeg?: number;
  /** Small tilts around neutral are ignored. */
  deadZoneDeg?: number;
  /** 0..1 low-pass factor applied to every sensor sample. */
  smooth?: number;
}

/**
 * Converts absolute device tilt into the kart's steering axis. The neutral
 * angle is captured from the current grip, so the player can hold the phone at
 * a comfortable angle instead of needing it perfectly level.
 */
export class TiltSteering {
  private readonly rangeDeg: number;
  private readonly deadZoneDeg: number;
  private readonly smooth: number;
  private neutral: number | null = null;
  private latestRoll: number | null = null;
  private value = 0;

  constructor(options: TiltSteeringOptions = {}) {
    this.rangeDeg = Math.max(1, options.rangeDeg ?? 25);
    this.deadZoneDeg = Math.max(0, Math.min(this.rangeDeg - 1, options.deadZoneDeg ?? 2.5));
    this.smooth = Math.max(0, Math.min(1, options.smooth ?? 0.28));
  }

  get steer(): number {
    return this.value;
  }

  /** Uses the latest sensor sample as the new straight-ahead grip. */
  recenter(): void {
    this.neutral = this.latestRoll;
    this.value = 0;
  }

  reset(): void {
    this.neutral = null;
    this.latestRoll = null;
    this.value = 0;
  }

  update(beta: number | null, gamma: number | null): number {
    if (beta === null || gamma === null || !Number.isFinite(beta) || !Number.isFinite(gamma)) {
      return this.value;
    }

    const roll = gravityRollDegrees(beta, gamma);
    if (!Number.isFinite(roll)) return this.value;
    this.latestRoll = roll;
    if (this.neutral === null) this.neutral = roll;

    const delta = wrapDegrees(roll - this.neutral);
    const magnitude = Math.abs(delta);
    let target = 0;
    if (magnitude > this.deadZoneDeg) {
      // Rolling counter-clockwise is a left turn (+1 in the input contract).
      const amount = Math.min(
        1,
        (magnitude - this.deadZoneDeg) / (this.rangeDeg - this.deadZoneDeg),
      );
      target = -Math.sign(delta) * amount;
    }

    this.value += (target - this.value) * this.smooth;
    if (Math.abs(this.value) < 0.001 && target === 0) this.value = 0;
    return this.value;
  }
}
