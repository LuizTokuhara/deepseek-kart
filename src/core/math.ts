export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolação exponencial independente do framerate.
 * Quanto maior `lambda`, mais rápido o valor alcança o alvo.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }
  return current + Math.sign(target - current) * maxDelta;
}

export function length2D(x: number, z: number): number {
  return Math.hypot(x, z);
}

export function dot2D(ax: number, az: number, bx: number, bz: number): number {
  return ax * bx + az * bz;
}

/**
 * Rotação em torno de Y, igual à convenção do Three.js.
 * Local -> mundo: x' = x*cos + z*sin; z' = -x*sin + z*cos.
 */
export function localToWorld2D(x: number, z: number, yaw: number): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x: c * x + s * z,
    z: -s * x + c * z,
  };
}

/** Mundo -> local. Inversa de `localToWorld2D`. */
export function worldToLocal2D(x: number, z: number, yaw: number): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x: c * x - s * z,
    z: s * x + c * z,
  };
}

export function shortestAngleDelta(from: number, to: number): number {
  const twoPi = Math.PI * 2;
  let delta = (to - from + Math.PI) % twoPi;
  if (delta < 0) {
    delta += twoPi;
  }
  return delta - Math.PI;
}

export function lerpAngle(from: number, to: number, t: number): number {
  return from + shortestAngleDelta(from, to) * t;
}
