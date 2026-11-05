export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export type Surface = "asphalt" | "grass";

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
  drift: boolean;
}

export interface Spawn {
  pos: Vec2;
  yaw: number;
}

export interface KartState {
  pos: Vec2;
  vel: Vec2;
  yaw: number;
  steer: number;
  vForward: number;
  vLateral: number;
  surface: Surface;
  surfaceBlend: number;
  height: number;
  verticalVelocity: number;
  grounded: boolean;
  drifting: boolean;
  driftDirection: -1 | 0 | 1;
  driftCharge: number;
  driftTier: number;
  miniTurboTimer: number;
  miniTurboTier: number;
}

export interface SurfaceProvider {
  surfaceAt(x: number, z: number): Surface;
}

export interface ColliderBox {
  center: Vec3Like;
  half: Vec3Like;
  yaw: number;
}

export interface CircleObbHit {
  normal: Vec2;
  depth: number;
}

export interface CameraTarget {
  pos: Vec2;
  yaw: number;
  speed: number;
  steer: number;
  vLateral: number;
  height: number;
  drifting: boolean;
  driftDirection: -1 | 0 | 1;
  boosting: boolean;
}
