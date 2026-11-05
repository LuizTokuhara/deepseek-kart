import type * as THREE from "three";
import type { ColliderBox } from "../core/types";

/** A course composes props; the game only manages their lifecycle. */
export interface Decoration {
  readonly group: THREE.Group;
  readonly colliders: readonly ColliderBox[];
  update?(dt: number): void;
  setStartLights?(label: string | null): void;
}
