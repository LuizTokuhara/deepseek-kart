import { AI } from "./config";
import { clamp, shortestAngleDelta } from "./math";
import type { Kart } from "./kart";
import type { Track } from "./track";
import type { DriveInput } from "./types";

/**
 * Seguidor de centerline simples: olha alguns pontos à frente, calcula o
 * ângulo até o alvo e usa acelerador/freio para manter uma velocidade-alvo.
 */
export class AIDriver {
  private pathIndex = 0;
  private stuckTime = 0;

  constructor(private readonly track: Track) {}

  reset(): void {
    this.pathIndex = 0;
    this.stuckTime = 0;
  }

  update(kart: Kart, dt: number): DriveInput {
    const state = kart.state;
    this.pathIndex = this.track.nearestPathIndex(
      state.pos.x,
      state.pos.z,
      this.pathIndex,
    );

    const speed = Math.hypot(state.vel.x, state.vel.z);
    const pathCount = this.track.path.length;
    const lookAhead = Math.max(
      3,
      Math.round((Math.max(speed, 4) * AI.lookAheadSeconds) / 3),
    );
    const targetIndex = (this.pathIndex + lookAhead) % pathCount;
    const target = this.track.path[targetIndex];
    const targetYaw = this.track.pathYaw(targetIndex);

    // Linha de corrida deslocada para a direita, para o AI não ficar
    // exatamente na trajetória do jogador.
    const targetX = target.x - Math.cos(targetYaw) * AI.laneOffset;
    const targetZ = target.z + Math.sin(targetYaw) * AI.laneOffset;

    const desiredYaw = Math.atan2(targetX - state.pos.x, targetZ - state.pos.z);
    const angleError = shortestAngleDelta(state.yaw, desiredYaw);
    const steer = clamp(angleError * AI.steerGain, -1, 1);

    if (speed < 0.5) {
      this.stuckTime += dt;
    } else {
      this.stuckTime = 0;
    }

    if (this.stuckTime > AI.stuckResetTime) {
      const point = this.track.path[this.pathIndex];
      kart.teleport(point.x, point.z, this.track.pathYaw(this.pathIndex));
      this.stuckTime = 0;
      return { throttle: 0, brake: 0, steer: 0, drift: false };
    }

    const throttle = state.vForward < AI.targetSpeed ? 1 : 0;
    const brake = state.vForward > AI.targetSpeed + 1.2 ? 0.6 : 0;

    return { throttle, brake, steer, drift: false };
  }
}
