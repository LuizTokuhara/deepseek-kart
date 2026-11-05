import { RACE } from "./config";
import type { KartState } from "./types";
import type { Track } from "./track";

export interface CountdownStep {
  /** Texto exibido no overlay: "3", "2", "1", "GO!" ou null. */
  label: string | null;
  /** Trava acelerador/freio/direção/drift/itens. */
  locked: boolean;
  /** True apenas no tick em que o countdown chega ao GO. */
  startedNow: boolean;
}

/**
 * Countdown de largada. Fica independente do HUD e da corrida para poder ser
 * testado sem DOM.
 */
export class RaceCountdown {
  private remaining: number;
  private goRemaining = 0;

  constructor(
    private readonly countdownSeconds: number = RACE.countdown,
    private readonly goSeconds: number = RACE.goDisplay,
  ) {
    this.remaining = countdownSeconds;
  }

  get label(): string | null {
    if (this.remaining > 0) {
      return Math.ceil(this.remaining).toString();
    }
    return this.goRemaining > 0 ? "GO!" : null;
  }

  get locked(): boolean {
    return this.remaining > 0;
  }

  reset(): void {
    this.remaining = this.countdownSeconds;
    this.goRemaining = 0;
  }

  update(dt: number): CountdownStep {
    let startedNow = false;

    if (this.remaining > 0) {
      this.remaining = Math.max(0, this.remaining - dt);
      if (this.remaining <= 0) {
        this.goRemaining = this.goSeconds;
        startedNow = true;
      }
    } else if (this.goRemaining > 0) {
      this.goRemaining = Math.max(0, this.goRemaining - dt);
    }

    return {
      label: this.label,
      locked: this.locked,
      startedNow,
    };
  }
}

/**
 * Detecta contramão comparando a direção real do movimento com a tangente da
 * centerline. Exige persistência para não piscar em curvas ou durante o spin.
 */
export class WrongWayDetector {
  private pathIndex = 0;
  private timer = 0;
  private active = false;

  constructor(private readonly track: Track) {}

  reset(): void {
    this.pathIndex = 0;
    this.timer = 0;
    this.active = false;
  }

  update(
    state: Pick<KartState, "pos" | "vel" | "yaw" | "spinTimer">,
    dt: number,
  ): boolean {
    const speed = Math.hypot(state.vel.x, state.vel.z);
    if (speed < RACE.wrongWayMinSpeed || state.spinTimer > 0) {
      this.timer = 0;
      this.active = false;
      return false;
    }

    this.pathIndex = this.track.nearestPathIndex(
      state.pos.x,
      state.pos.z,
      this.pathIndex,
      40,
    );
    const pathYaw = this.track.pathYaw(this.pathIndex);
    const headingX = state.vel.x / speed;
    const headingZ = state.vel.z / speed;
    const alignment =
      headingX * Math.sin(pathYaw) + headingZ * Math.cos(pathYaw);

    if (alignment >= RACE.wrongWayDot) {
      this.timer = 0;
      this.active = false;
      return false;
    }

    this.timer += dt;
    if (this.timer >= RACE.wrongWayTime) {
      this.active = true;
    }
    return this.active;
  }
}
