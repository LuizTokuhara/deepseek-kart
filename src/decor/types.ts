import type * as THREE from "three";
import type { ColliderBox, MovingObstacle } from "../core/types";

/** A course composes props; the game only manages their lifecycle. */
export interface Decoration {
  readonly group: THREE.Group;
  readonly colliders: readonly ColliderBox[];
  readonly movingObstacles?: readonly MovingObstacle[];
  /** Obstáculos com colisão avançam antes dos karts, no tick da física. */
  fixedUpdate?(dt: number): void;
  reset?(): void;
  update?(dt: number): void;
  setStartLights?(label: string | null): void;
}
