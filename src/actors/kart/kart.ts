import { PHYSICS } from "../../core/config";
import { clamp, damp, lerp, moveToward } from "../../core/math";
import { CollisionWorld } from "../../core/collision";
import type { DriveInput, KartState, Spawn, SurfaceProvider } from "../../core/types";

export class Kart {
  readonly state: KartState;

  private readonly spawn: Spawn;
  private readonly track: SurfaceProvider;
  private readonly collision: CollisionWorld;
  private previousDrift = false;
  private driftCounterSteerTime = 0;

  constructor(spawn: Spawn, track: SurfaceProvider, collision: CollisionWorld) {
    this.spawn = {
      pos: { x: spawn.pos.x, z: spawn.pos.z },
      yaw: spawn.yaw,
    };
    this.track = track;
    this.collision = collision;

    this.state = {
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      yaw: 0,
      steer: 0,
      steerInput: 0,
      vForward: 0,
      vLateral: 0,
      surface: "asphalt",
      surfaceBlend: 0,
      height: 0,
      verticalVelocity: 0,
      grounded: true,
      drifting: false,
      driftDirection: 0,
      driftCharge: 0,
      driftTier: 0,
      miniTurboTimer: 0,
      miniTurboTier: 0,
      item: null,
      itemCount: 0,
      spinTimer: 0,
    };

    this.reset();
  }

  reset(): void {
    this.state.pos.x = this.spawn.pos.x;
    this.state.pos.z = this.spawn.pos.z;
    this.state.vel.x = 0;
    this.state.vel.z = 0;
    this.state.yaw = this.spawn.yaw;
    this.state.steer = 0;
    this.state.steerInput = 0;
    this.state.vForward = 0;
    this.state.vLateral = 0;
    this.state.surface = this.track.surfaceAt(this.state.pos.x, this.state.pos.z);
    this.state.surfaceBlend = this.state.surface === "grass" ? 1 : 0;
    this.state.height = 0;
    this.state.verticalVelocity = 0;
    this.state.grounded = true;
    this.state.drifting = false;
    this.state.driftDirection = 0;
    this.state.driftCharge = 0;
    this.state.driftTier = 0;
    this.state.miniTurboTimer = 0;
    this.state.miniTurboTier = 0;
    this.state.item = null;
    this.state.itemCount = 0;
    this.state.spinTimer = 0;
    this.previousDrift = false;
    this.driftCounterSteerTime = 0;
  }

  get speed(): number {
    return Math.hypot(this.state.vel.x, this.state.vel.z);
  }

  /** Posiciona o kart sem passar pelo reset de spawn. Útil para debug/tuning. */
  teleport(x: number, z: number, yaw = this.state.yaw): void {
    this.state.pos.x = x;
    this.state.pos.z = z;
    this.state.vel.x = 0;
    this.state.vel.z = 0;
    this.state.yaw = yaw;
    this.state.steer = 0;
    this.state.steerInput = 0;
    this.state.vForward = 0;
    this.state.vLateral = 0;
    this.state.surface = this.track.surfaceAt(x, z);
    this.state.surfaceBlend = this.state.surface === "grass" ? 1 : 0;
    this.state.height = 0;
    this.state.verticalVelocity = 0;
    this.state.grounded = true;
    this.state.drifting = false;
    this.state.driftDirection = 0;
    this.state.driftCharge = 0;
    this.state.driftTier = 0;
    this.state.miniTurboTimer = 0;
    this.state.miniTurboTier = 0;
    this.state.item = null;
    this.state.itemCount = 0;
    this.state.spinTimer = 0;
    this.previousDrift = false;
    this.driftCounterSteerTime = 0;
  }

  update(dt: number, input: DriveInput): void {
    if (this.state.miniTurboTimer > 0) {
      this.state.miniTurboTimer = Math.max(0, this.state.miniTurboTimer - dt);
    }
    if (this.state.spinTimer > 0) {
      this.state.spinTimer = Math.max(0, this.state.spinTimer - dt);
    }
    const controlsLocked = this.state.spinTimer > 0;

    const targetSurface = this.track.surfaceAt(this.state.pos.x, this.state.pos.z);
    this.state.surface = targetSurface;
    this.state.surfaceBlend = damp(
      this.state.surfaceBlend,
      targetSurface === "grass" ? 1 : 0,
      PHYSICS.surfaceBlend,
      dt,
    );

    const targetSteer = controlsLocked ? 0 : clamp(input.steer, -1, 1);
    this.state.steerInput = targetSteer;
    this.state.steer = damp(this.state.steer, targetSteer, PHYSICS.steerSmooth, dt);

    const driftHeld = input.drift && !controlsLocked;
    const driftPressed = driftHeld && !this.previousDrift;
    if (driftPressed && this.state.grounded) {
      this.state.verticalVelocity = PHYSICS.hopVelocity;
      this.state.grounded = false;
      if (this.state.height <= 0) {
        this.state.height = 0.001;
      }
    }

    const yaw = this.state.yaw;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = -Math.cos(yaw);
    const rightZ = Math.sin(yaw);

    let vForward = this.state.vel.x * forwardX + this.state.vel.z * forwardZ;
    let vLateral = this.state.vel.x * rightX + this.state.vel.z * rightZ;
    const speedAbs = Math.abs(vForward);

    if (
      driftHeld &&
      !this.state.drifting &&
      vForward > PHYSICS.driftMinSpeed &&
      Math.abs(this.state.steer) > PHYSICS.driftSteerThreshold
    ) {
      this.startDrift();
    }

    if (this.state.drifting) {
      if (controlsLocked || speedAbs < PHYSICS.driftCancelSpeed) {
        this.endDrift(false);
      } else if (!driftHeld) {
        this.endDrift(true);
      } else {
        const counterSteering =
          (this.state.driftDirection > 0 &&
            this.state.steer < -PHYSICS.driftSteerThreshold) ||
          (this.state.driftDirection < 0 &&
            this.state.steer > PHYSICS.driftSteerThreshold);

        if (counterSteering) {
          this.driftCounterSteerTime += dt;
          if (this.driftCounterSteerTime >= PHYSICS.driftSwitchTime) {
            this.switchDriftDirection(this.state.steer > 0 ? 1 : -1);
          }
        } else {
          this.driftCounterSteerTime = 0;
        }

        this.state.driftCharge = Math.min(
          1,
          this.state.driftCharge + dt / PHYSICS.driftChargeTime,
        );
        this.state.driftTier = this.tierForCharge(this.state.driftCharge);
      }
    }

    const throttle = controlsLocked ? 0 : clamp(input.throttle, 0, 1);
    const brake = controlsLocked ? 0 : clamp(input.brake, 0, 1);
    const braking = brake > 0.01;

    const boostActive = this.state.miniTurboTimer > 0;
    const boostTier = clamp(this.state.miniTurboTier, 0, 3);
    const boostAccel = boostActive ? PHYSICS.miniTurbo.accel[boostTier] : 0;
    const topSpeed =
      PHYSICS.topSpeed + (boostActive ? PHYSICS.miniTurbo.topSpeedBonus[boostTier] : 0);

    const speedRatio = clamp(Math.abs(vForward) / PHYSICS.topSpeed, 0, 1);
    const band = clamp(Math.floor(speedRatio * 10), 0, 9);

    const engine =
      (braking ? 0 : throttle) *
        PHYSICS.accelBands[band] *
        lerp(1, PHYSICS.grassAccelScale, this.state.surfaceBlend) +
      boostAccel;

    const dragMagnitude =
      PHYSICS.coastDrag * Math.abs(vForward) +
      PHYSICS.rollingResistance +
      PHYSICS.grassExtraRolling * this.state.surfaceBlend +
      PHYSICS.grassExtraDrag * Math.abs(vForward) * this.state.surfaceBlend;

    vForward += (engine - Math.sign(vForward) * dragMagnitude) * dt;

    if (braking) {
      if (vForward > 0.25) {
        vForward = moveToward(vForward, 0, PHYSICS.brakeDecel * dt);
      } else {
        vForward = moveToward(
          vForward,
          -PHYSICS.reverseSpeed,
          PHYSICS.reverseAccel * dt,
        );
      }
    }

    // O mini-turbo aumenta o teto. Enquanto ele está ativo, o teto é rígido;
    // ao terminar, a velocidade acima do teto normal decai suavemente em vez
    // de ser cortada de uma vez.
    if (vForward > topSpeed) {
      if (boostActive) {
        vForward = topSpeed;
      } else {
        vForward = Math.max(topSpeed, vForward - PHYSICS.overSpeedDecel * dt);
      }
    } else {
      vForward = clamp(vForward, -PHYSICS.reverseSpeed, topSpeed);
    }

    let grip = lerp(PHYSICS.gripAsphalt, PHYSICS.gripGrass, this.state.surfaceBlend);
    if (this.state.drifting) {
      grip *= PHYSICS.driftGripScale;
    }
    vLateral *= Math.exp(-grip * dt);

    // Recomposição com o yaw atual. A mudança de yaw acontece depois, o que
    // cria naturalmente um pequeno escorregamento lateral.
    this.state.vel.x = forwardX * vForward + rightX * vLateral;
    this.state.vel.z = forwardZ * vForward + rightZ * vLateral;

    const steerForTurn = this.state.drifting
      ? clamp(
          this.state.driftDirection * PHYSICS.driftSteerBias +
            this.state.steer * PHYSICS.driftSteerWeight,
          -1,
          1,
        )
      : this.state.steer;

    const turnScale = this.state.drifting ? PHYSICS.driftTurnScale : 1;
    const speedFactor = clamp(Math.abs(vForward) / PHYSICS.turnSpeedRef, 0, 1);
    const topSpeedFactor =
      1 - PHYSICS.turnSpeedFalloff * clamp(Math.abs(vForward) / PHYSICS.topSpeed, 0, 1);
    const turnRate = PHYSICS.maxTurnRate * speedFactor * topSpeedFactor * turnScale;
    const reverseSign = vForward < -0.01 ? -1 : 1;

    this.state.yaw += steerForTurn * turnRate * dt * reverseSign;

    this.integrate(dt);

    const newYaw = this.state.yaw;
    const newForwardX = Math.sin(newYaw);
    const newForwardZ = Math.cos(newYaw);
    const newRightX = -Math.cos(newYaw);
    const newRightZ = Math.sin(newYaw);

    this.state.vForward = this.state.vel.x * newForwardX + this.state.vel.z * newForwardZ;
    this.state.vLateral = this.state.vel.x * newRightX + this.state.vel.z * newRightZ;
    this.state.surface = this.track.surfaceAt(this.state.pos.x, this.state.pos.z);

    if (!this.state.grounded) {
      this.state.verticalVelocity -= PHYSICS.hopGravity * dt;
      this.state.height += this.state.verticalVelocity * dt;
      if (this.state.height <= 0) {
        this.state.height = 0;
        this.state.verticalVelocity = 0;
        this.state.grounded = true;
      }
    }

    this.previousDrift = input.drift;
  }

  private startDrift(): void {
    this.state.drifting = true;
    this.state.driftDirection = this.state.steer > 0 ? 1 : -1;
    this.state.driftCharge = 0;
    this.state.driftTier = 0;
    this.driftCounterSteerTime = 0;
  }

  private endDrift(allowBoost: boolean): void {
    const tier = this.state.driftTier;

    this.state.drifting = false;
    this.state.driftDirection = 0;
    this.state.driftCharge = 0;
    this.state.driftTier = 0;
    this.driftCounterSteerTime = 0;

    if (allowBoost && tier > 0) {
      this.state.miniTurboTier = tier;
      this.state.miniTurboTimer = PHYSICS.miniTurbo.durations[tier];
    }
  }

  private switchDriftDirection(direction: -1 | 1): void {
    this.state.driftDirection = direction;
    this.state.driftCharge = 0;
    this.state.driftTier = 0;
    this.driftCounterSteerTime = 0;
  }

  private tierForCharge(charge: number): number {
    const thresholds = PHYSICS.miniTurbo.chargeThresholds;
    if (charge >= thresholds[2]) {
      return 3;
    }
    if (charge >= thresholds[1]) {
      return 2;
    }
    if (charge >= thresholds[0]) {
      return 1;
    }
    return 0;
  }

  private integrate(dt: number): void {
    const distance = this.speed * dt;
    const steps = Math.max(1, Math.min(8, Math.ceil(distance / PHYSICS.maxSubstep)));
    const stepDt = dt / steps;

    for (let step = 0; step < steps; step++) {
      this.state.pos.x += this.state.vel.x * stepDt;
      this.state.pos.z += this.state.vel.z * stepDt;
      this.collision.resolveKart(this.state);
    }
  }
}
