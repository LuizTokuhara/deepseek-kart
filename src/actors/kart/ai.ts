import { AI, PHYSICS } from "../../core/config";
import { clamp, shortestAngleDelta } from "../../core/math";
import type { Kart } from "./kart";
import type { TrackLike } from "../../tracks/track";
import type { DriveInput, KartState, MovingObstacle } from "../../core/types";
import type { Difficulty } from "../../race/difficulty";

export interface AIUpdateContext {
  /** Oil slicks the kart should try to avoid; `y` is the level they are on. */
  oilSlicks?: readonly { x: number; z: number; y?: number }[];
  /** Other karts the driver should pass cleanly; `y` is the level they are on. */
  rivals?: readonly { x: number; z: number; y?: number }[];
  /** Pace multiplier for rubber-banding. */
  paceScale?: number;
  /** Current positions and velocities of moving crossings. */
  movingObstacles?: readonly MovingObstacle[];
}

/**
 * Centerline follower: looks at a few points ahead, computes the angle to the
 * target, uses throttle/brake to maintain the target speed and enters a drift
 * in corners. It also avoids oil slicks; tactical item use stays in ItemSystem.
 */
export class AIDriver {
  private pathIndex = 0;
  private stuckTime = 0;
  private difficulty: Difficulty = "hard";
  private mistakeCooldown: number = AI.mistakeInterval;
  private mistakeTimer = 0;

  constructor(
    private readonly track: TrackLike,
    private readonly laneOffset: number = AI.laneOffset,
  ) {}

  setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    this.mistakeCooldown = this.mistakeInterval;
    this.mistakeTimer = 0;
  }

  reset(): void {
    this.pathIndex = 0;
    this.stuckTime = 0;
    this.mistakeCooldown = this.mistakeInterval;
    this.mistakeTimer = 0;
  }

  private get tuning(): typeof AI.normal | null {
    return this.difficulty === "normal" ? AI.normal : null;
  }

  private get mistakeInterval(): number {
    return this.tuning?.mistakeInterval ?? AI.mistakeInterval;
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

    const tuning = this.tuning;
    const speed = Math.hypot(state.vel.x, state.vel.z);
    const pathCount = this.track.path.length;
    const pathSpacing = Math.max(1, this.track.pathSpacing);
    const lookAheadDistance = clamp(
      Math.max(speed, 5) *
        AI.lookAheadSeconds *
        (tuning?.lookAheadScale ?? 1),
      AI.minLookAhead,
      AI.maxLookAhead,
    );
    const lookAhead = Math.max(2, Math.round(lookAheadDistance / pathSpacing));
    const targetIndex = (this.pathIndex + lookAhead) % pathCount;
    const target = this.track.path[targetIndex];
    const targetYaw = this.track.pathYaw(targetIndex);

    // Racing line shifted to the right, cutting toward the inside of the
    // upcoming bend, with offsets to steer around oil, holes and rivals.
    const moving = this.movingObstacleResponse(state, context.movingObstacles ?? []);
    const avoidOffset = moving.offset +
      this.oilSlickAvoidance(
        state,
        context.oilSlicks ?? [],
        tuning?.hazardLookAheadScale ?? 1,
      ) +
      this.hazardAvoidance(
        state,
        tuning?.hazardLookAheadScale ?? 1,
      ) +
      this.rivalAvoidance(
        state,
        context.rivals ?? [],
        tuning?.rivalAvoidScale ?? 1,
      );
    const laneOffset = clamp(
      this.laneOffset +
        this.cornerCutOffset(tuning?.cornerCutScale ?? 1) +
        avoidOffset,
      -AI.maxLaneOffset,
      AI.maxLaneOffset,
    );
    const targetX = target.x - Math.cos(targetYaw) * laneOffset;
    const targetZ = target.z + Math.sin(targetYaw) * laneOffset;

    const desiredYaw = Math.atan2(targetX - state.pos.x, targetZ - state.pos.z);
    const angleError = shortestAngleDelta(state.yaw, desiredYaw);
    const steer = clamp(
      angleError * AI.steerGain * (tuning?.steerGainScale ?? 1),
      -1,
      1,
    );

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
      kart.teleport(point.x, point.z, this.track.pathYaw(this.pathIndex),
        this.track.pathLevel?.(this.pathIndex) ?? 0);
      this.stuckTime = 0;
      return { throttle: 0, brake: 0, steer: 0, drift: false };
    }

    const paceScale = clamp(
      context.paceScale ?? 1,
      AI.paceScaleMin,
      AI.paceScaleMax,
    );
    const targetSpeed = Math.min(
      AI.targetSpeed * paceScale,
      this.cornerSpeedLimit(this.pathIndex, speed, tuning),
      moving.speedLimit,
    );
    let throttle = state.vForward < targetSpeed ? 1 : 0;
    const overshoot = state.vForward - targetSpeed;
    const brake = overshoot > AI.brakeThreshold
      ? clamp(0.4 + (overshoot - AI.brakeThreshold) * AI.brakeGain, 0.4, 1)
      : 0;

    if (this.mistakeTimer > 0) {
      throttle *= tuning?.mistakeThrottleScale ?? AI.mistakeThrottleScale;
    }

    return { throttle, brake, steer, drift };
  }

  /** Shifts the line toward the apex of the bend just ahead. */
  private cornerCutOffset(scale: number): number {
    const turn = this.track.pathYawDelta(
      this.pathIndex,
      AI.cornerCutLookAhead,
    );
    const intensity = clamp(
      (Math.abs(turn) - AI.cornerCutMinAngle) / AI.cornerCutAngleRange,
      0,
      1,
    );
    return -Math.sign(turn) * AI.cornerCutOffset * intensity * scale;
  }

  /**
   * Maximum speed that still allows braking to a safe apex speed. Sampling
   * local curvature over the braking horizon avoids slowing for gentle bends.
   */
  private cornerSpeedLimit(
    index: number,
    speed: number,
    tuning: typeof AI.normal | null,
  ): number {
    const spacing = Math.max(1, this.track.pathSpacing);
    const sample = Math.max(1, Math.round(AI.cornerSampleDistance / spacing));
    const horizon = Math.max(
      sample,
      Math.round(
        (speed *
          AI.cornerLookAheadSeconds *
          (tuning?.cornerLookAheadScale ?? 1)) /
          spacing,
      ),
    );
    const grip = AI.cornerGrip * (tuning?.cornerGripScale ?? 1);
    let limit = Infinity;
    const firstSample = Math.max(1, Math.floor(sample / 2));

    for (let ahead = firstSample; ahead <= horizon; ahead += sample) {
      const angle = Math.abs(this.track.pathYawDelta(index + ahead, sample));
      const distance = sample * spacing;
      const curvature = angle / distance;
      if (curvature < AI.cornerMinCurvature) {
        continue;
      }

      const safe = Math.max(
        AI.cornerMinSpeed,
        Math.sqrt(grip / curvature),
      );
      const brakingDistance = ahead * spacing;
      const allowed = Math.sqrt(
        safe * safe + 2 * AI.cornerBrakeDecel * brakingDistance,
      );
      limit = Math.min(limit, allowed);
    }

    return limit;
  }

  /** Picks the side with more room and shifts away from a kart just ahead. */
  private rivalAvoidance(
    state: Pick<KartState, "pos" | "yaw" | "height">,
    rivals: readonly { x: number; z: number; y?: number }[],
    scale: number,
  ): number {
    if (rivals.length === 0) {
      return 0;
    }

    const forwardX = Math.sin(state.yaw);
    const forwardZ = Math.cos(state.yaw);
    const rightX = -Math.cos(state.yaw);
    const rightZ = Math.sin(state.yaw);

    let nearestForward = Infinity;
    let nearestLateral = 0;

    for (const rival of rivals) {
      if (Math.abs((rival.y ?? state.height) - state.height) > PHYSICS.levelGap) {
        continue;
      }
      const dx = rival.x - state.pos.x;
      const dz = rival.z - state.pos.z;
      const forward = dx * forwardX + dz * forwardZ;
      if (forward < 0.5 || forward > AI.kartLookAhead) {
        continue;
      }
      const lateral = dx * rightX + dz * rightZ;
      if (Math.abs(lateral) > AI.kartClearance) {
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

    const urgency = 1 - nearestForward / AI.kartLookAhead;
    const side = Math.abs(nearestLateral) > 0.3
      ? -Math.sign(nearestLateral)
      : this.laneOffset >= 0 ? -1 : 1;
    return side * AI.kartAvoidOffset * (0.5 + 0.5 * urgency) * scale;
  }

  private oilSlickAvoidance(
    state: Pick<KartState, "pos" | "yaw" | "height">,
    oilSlicks: readonly { x: number; z: number; y?: number }[],
    lookAheadScale: number,
  ): number {
    if (oilSlicks.length === 0) {
      return 0;
    }

    const forwardX = Math.sin(state.yaw);
    const forwardZ = Math.cos(state.yaw);
    const rightX = -Math.cos(state.yaw);
    const rightZ = Math.sin(state.yaw);

    const lookAhead = AI.oilSlickLookAhead * lookAheadScale;
    let nearestForward = Infinity;
    let nearestLateral = 0;

    for (const oilSlick of oilSlicks) {
      // Oil on the overpass does not affect those passing below, and vice versa.
      if (Math.abs((oilSlick.y ?? state.height) - state.height) > PHYSICS.levelGap) continue;
      const dx = oilSlick.x - state.pos.x;
      const dz = oilSlick.z - state.pos.z;
      const forward = dx * forwardX + dz * forwardZ;
      if (forward < 0.8 || forward > lookAhead) {
        continue;
      }

      const lateral = dx * rightX + dz * rightZ;
      if (Math.abs(lateral) > AI.oilSlickClearance) {
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

    const urgency = 1 - nearestForward / lookAhead;
    const side = nearestLateral >= 0 ? -1 : 1;
    return side * AI.oilSlickAvoidOffset * (0.45 + 0.55 * urgency);
  }

  /** Avoids ice holes using the same lateral hysteresis as the oil slick. */
  private hazardAvoidance(
    state: Pick<KartState, "pos" | "yaw">,
    lookAheadScale: number,
  ): number {
    const hazards = this.track.hazards ?? [];
    if (hazards.length === 0) {
      return 0;
    }

    const forwardX = Math.sin(state.yaw);
    const forwardZ = Math.cos(state.yaw);
    const rightX = -Math.cos(state.yaw);
    const rightZ = Math.sin(state.yaw);

    const lookAhead = AI.oilSlickLookAhead * lookAheadScale;
    let nearestForward = Infinity;
    let nearestLateral = 0;
    let nearestClearance = 0;

    for (const hazard of hazards) {
      const dx = hazard.x - state.pos.x;
      const dz = hazard.z - state.pos.z;
      const forward = dx * forwardX + dz * forwardZ;
      if (forward < 1 || forward > lookAhead) {
        continue;
      }
      const lateral = dx * rightX + dz * rightZ;
      const clearance = hazard.radius + 0.9;
      if (Math.abs(lateral) > clearance) {
        continue;
      }
      if (forward < nearestForward) {
        nearestForward = forward;
        nearestLateral = lateral;
        nearestClearance = clearance;
      }
    }

    if (!Number.isFinite(nearestForward)) {
      return 0;
    }

    const urgency = 1 - nearestForward / lookAhead;
    const side = nearestLateral >= 0 ? -1 : 1;
    return side * (nearestClearance + 0.8) * (0.55 + 0.45 * urgency);
  }

  /** Predicts where the penguin will be on arrival and tries to pass behind it. */
  private movingObstacleResponse(
    state: Pick<KartState, "pos" | "yaw" | "vel">,
    obstacles: readonly MovingObstacle[],
  ): { offset: number; speedLimit: number } {
    const forwardX = Math.sin(state.yaw), forwardZ = Math.cos(state.yaw);
    const rightX = -Math.cos(state.yaw), rightZ = Math.sin(state.yaw);
    const speed = Math.hypot(state.vel.x, state.vel.z);
    let nearest = Infinity;
    let offset = 0;
    let speedLimit = Infinity;
    for (const obstacle of obstacles) {
      const dx = obstacle.x - state.pos.x, dz = obstacle.z - state.pos.z;
      const forward = dx * forwardX + dz * forwardZ;
      if (forward < -0.5 || forward > 20) continue;
      const arrival = clamp(forward / Math.max(speed, 6), 0, 1.5);
      const lateral = dx * rightX + dz * rightZ;
      const lateralSpeed = obstacle.vx * rightX + obstacle.vz * rightZ;
      const predicted = lateral + lateralSpeed * arrival;
      const clearance = obstacle.radius + 1.25;
      if (Math.abs(predicted) > clearance && (forward > 6 || Math.abs(lateral) > clearance)) continue;
      if (forward < nearest) {
        nearest = forward;
        const side = Math.abs(lateralSpeed) > 0.1 ? -Math.sign(lateralSpeed) : predicted >= 0 ? -1 : 1;
        offset = side * (obstacle.radius + 2.5);
        // Slows down when the room for the maneuver becomes short; it does not stop at the crossing.
        speedLimit = forward < 10 ? Math.max(4, forward * 0.9) : Infinity;
      }
    }
    return { offset, speedLimit };
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

    // Occasional mistake: eases off the throttle for a few tenths on the straight.
    this.mistakeTimer = this.tuning?.mistakeDuration ?? AI.mistakeDuration;
    this.mistakeCooldown = this.mistakeInterval;
  }
}
