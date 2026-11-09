import type * as THREE from "three";
import type { ColliderBox, MovingObstacle } from "../core/types";

/** What the scenery knows about the current frame, beyond time. */
export interface DecorationFrame {
  /** Camera position, for lights and effects that follow the player. */
  readonly view: THREE.Vector3;
  /** System preference for less motion (blinking lights, etc.). */
  readonly reducedMotion: boolean;
}

/** A course composes props; the game only manages their lifecycle. */
export interface Decoration {
  readonly group: THREE.Group;
  readonly colliders: readonly ColliderBox[];
  readonly movingObstacles?: readonly MovingObstacle[];
  /** Obstacles with collision advance before the karts, in the physics tick. */
  fixedUpdate?(dt: number): void;
  reset?(): void;
  update?(dt: number, frame?: DecorationFrame): void;
  setStartLights?(label: string | null): void;
}
