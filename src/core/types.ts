export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export type Surface = "asphalt" | "dirt" | "grass" | "ice" | "sand" | "stone";

export type ItemType = "oil-can" | "missile" | "red-missile" | "lightning";

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
  steerInput: number;
  vForward: number;
  vLateral: number;
  surface: Surface;
  surfaceBlend: number;
  height: number;
  verticalVelocity: number;
  grounded: boolean;
  falling: boolean;
  fallTimer: number;
  groundPitch: number;
  groundRoll: number;
  drifting: boolean;
  driftDirection: -1 | 0 | 1;
  driftCharge: number;
  driftTier: number;
  miniTurboTimer: number;
  miniTurboTier: number;
  item: ItemType | null;
  itemCount: number;
  spinTimer: number;
}

export interface SurfaceProvider {
  surfaceAt(x: number, z: number): Surface;
}

export interface MovingObstacle {
  x: number;
  z: number;
  radius: number;
  vx: number;
  vz: number;
}

export interface ColliderBox {
  /** False removes the collider from kart, projectile and camera queries. */
  enabled?: boolean;
  /** Called on capsule contact, before the solid-wall response. May disable this box. */
  onKartContact?: (state: KartState) => void;
  /** Obstáculos baixos permitem que um kart em voo passe por cima. */
  heightAware?: boolean;
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
  /** Altura do leito (viaduto) sob o kart; a câmera acompanha por inteiro. */
  level?: number;
  drifting: boolean;
  driftDirection: -1 | 0 | 1;
  boosting: boolean;
}
