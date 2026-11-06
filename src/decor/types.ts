import type * as THREE from "three";
import type { ColliderBox, MovingObstacle } from "../core/types";

/** O que o cenário sabe do quadro atual, além do tempo. */
export interface DecorationFrame {
  /** Posição da câmera, para luzes e efeitos que acompanham o jogador. */
  readonly view: THREE.Vector3;
  /** Preferência do sistema por menos movimento (luzes piscando, etc.). */
  readonly reducedMotion: boolean;
}

/** A course composes props; the game only manages their lifecycle. */
export interface Decoration {
  readonly group: THREE.Group;
  readonly colliders: readonly ColliderBox[];
  readonly movingObstacles?: readonly MovingObstacle[];
  /** Obstáculos com colisão avançam antes dos karts, no tick da física. */
  fixedUpdate?(dt: number): void;
  reset?(): void;
  update?(dt: number, frame?: DecorationFrame): void;
  setStartLights?(label: string | null): void;
}
