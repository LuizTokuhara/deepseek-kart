import { AI } from "../../core/config";
import { clamp, shortestAngleDelta } from "../../core/math";
import type { Kart } from "./kart";
import type { TrackLike } from "../../tracks/track";
import type { DriveInput, KartState } from "../../core/types";

export interface AIUpdateContext {
  /** Bananas que o kart deve tentar desviar. */
  bananas?: readonly { x: number; z: number }[];
  /** Multiplicador de ritmo para rubber-banding. */
  paceScale?: number;
}

/**
 * Seguidor de centerline: olha alguns pontos à frente, calcula o ângulo até o
 * alvo, usa acelerador/freio para manter a velocidade-alvo e entra em drift
 * nas curvas. Também desvia de bananas; o uso tático de itens fica no
 * ItemSystem.
 */
export class AIDriver {
  private pathIndex = 0;
  private stuckTime = 0;
  private mistakeCooldown = AI.mistakeInterval;
  private mistakeTimer = 0;

  constructor(
    private readonly track: TrackLike,
    private readonly laneOffset: number = AI.laneOffset,
  ) {}

  reset(): void {
    this.pathIndex = 0;
    this.stuckTime = 0;
    this.mistakeCooldown = AI.mistakeInterval;
    this.mistakeTimer = 0;
  }

  update(
    kart: Kart,
    dt: number,
    context: AIUpdateContext = {},
  ): DriveInput {
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

    // Linha de corrida deslocada para a direita, com desvio opcional para
    // contornar bananas que estejam na trajetória.
    const avoidOffset = this.bananaAvoidance(state, context.bananas ?? []);
    const laneOffset = clamp(
      this.laneOffset + avoidOffset,
      -AI.maxLaneOffset,
      AI.maxLaneOffset,
    );
    const targetX = target.x - Math.cos(targetYaw) * laneOffset;
    const targetZ = target.z + Math.sin(targetYaw) * laneOffset;

    const desiredYaw = Math.atan2(targetX - state.pos.x, targetZ - state.pos.z);
    const angleError = shortestAngleDelta(state.yaw, desiredYaw);
    const steer = clamp(angleError * AI.steerGain, -1, 1);

    const cornerAngle = Math.abs(
      this.track.pathYawDelta(this.pathIndex, AI.driftLookAhead),
    );
    const corner = state.drifting
      ? cornerAngle > AI.driftExitAngle
      : cornerAngle > AI.driftEnterAngle;
    const drift = corner && state.vForward > AI.driftMinSpeed;

    this.updateMistake(dt, state, cornerAngle);

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

    const paceScale = clamp(
      context.paceScale ?? 1,
      AI.paceScaleMin,
      AI.paceScaleMax,
    );
    const targetSpeed = AI.targetSpeed * paceScale;
    let throttle = state.vForward < targetSpeed ? 1 : 0;
    const brake = state.vForward > targetSpeed + 1.2 ? 0.6 : 0;

    if (this.mistakeTimer > 0) {
      throttle *= AI.mistakeThrottleScale;
    }

    return { throttle, brake, steer, drift };
  }

  private bananaAvoidance(
    state: Pick<KartState, "pos" | "yaw">,
    bananas: readonly { x: number; z: number }[],
  ): number {
    if (bananas.length === 0) {
      return 0;
    }

    const forwardX = Math.sin(state.yaw);
    const forwardZ = Math.cos(state.yaw);
    const rightX = -Math.cos(state.yaw);
    const rightZ = Math.sin(state.yaw);

    let nearestForward = Infinity;
    let nearestLateral = 0;

    for (const banana of bananas) {
      const dx = banana.x - state.pos.x;
      const dz = banana.z - state.pos.z;
      const forward = dx * forwardX + dz * forwardZ;
      if (forward < 0.8 || forward > AI.bananaLookAhead) {
        continue;
      }

      const lateral = dx * rightX + dz * rightZ;
      if (Math.abs(lateral) > AI.bananaClearance) {
        continue;
      }

      if (forward < nearestForward) {
        nearestForward = forward;
        nearestLateral = lateral;
      }
    }

    if (!Number.isFinite(nearestForward)) {
      return 0;
    }

    const urgency = 1 - nearestForward / AI.bananaLookAhead;
    const side = nearestLateral >= 0 ? -1 : 1;
    return side * AI.bananaAvoidOffset * (0.45 + 0.55 * urgency);
  }

  private updateMistake(
    dt: number,
    state: Pick<KartState, "drifting" | "vForward">,
    cornerAngle: number,
  ): void {
    if (this.mistakeTimer > 0) {
      this.mistakeTimer = Math.max(0, this.mistakeTimer - dt);
      return;
    }

    this.mistakeCooldown -= dt;
    if (this.mistakeCooldown > 0) {
      return;
    }

    if (
      state.drifting ||
      cornerAngle >= AI.driftExitAngle ||
      state.vForward < AI.driftMinSpeed
    ) {
      return;
    }

    // Erro ocasional: alivia o acelerador por alguns décimos na reta.
    this.mistakeTimer = AI.mistakeDuration;
    this.mistakeCooldown = AI.mistakeInterval;
  }
}
