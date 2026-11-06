import { KART_WHEEL_CONTACTS, PHYSICS } from "../../core/config";
import { clamp, damp, lerp, moveToward } from "../../core/math";
import { CollisionWorld } from "../../core/collision";
import type {
  DriveInput,
  KartState,
  Spawn,
  SurfaceProvider,
} from "../../core/types";

/**
 * Contrato de terreno consumido pelo kart. Os métodos novos são opcionais
 * para manter compatibilidade com pistas planas e com testes isolados.
 */
export interface KartTrack extends SurfaceProvider {
  heightAt?(x: number, z: number): number;
  bankAt?(x: number, z: number): number;
  rampLaunchAt?(fromX: number, fromZ: number, toX: number, toZ: number): number;
  holeAt?(x: number, z: number): boolean;
  isOutOfBounds?(x: number, z: number): boolean;
  recoveryPoint?(x: number, z: number): Spawn;
}

export class Kart {
  readonly state: KartState;

  private readonly spawn: Spawn;
  private readonly track: KartTrack;
  private readonly collision: CollisionWorld;
  private previousDrift = false;
  private driftCounterSteerTime = 0;

  constructor(spawn: Spawn, track: KartTrack, collision: CollisionWorld) {
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
      falling: false,
      fallTimer: 0,
      groundPitch: 0,
      groundRoll: 0,
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
    this.place(this.spawn.pos, this.spawn.yaw, false);
    this.state.item = null;
    this.state.itemCount = 0;
  }

  get speed(): number {
    return Math.hypot(this.state.vel.x, this.state.vel.z);
  }

  /** Posiciona o kart sem passar pelo reset de spawn. Útil para debug/tuning. */
  teleport(x: number, z: number, yaw = this.state.yaw): void {
    this.place({ x, z }, yaw, false);
    this.state.item = null;
    this.state.itemCount = 0;
  }

  update(dt: number, input: DriveInput): void {
    if (this.state.miniTurboTimer > 0) {
      this.state.miniTurboTimer = Math.max(0, this.state.miniTurboTimer - dt);
    }
    if (this.state.spinTimer > 0) {
      this.state.spinTimer = Math.max(0, this.state.spinTimer - dt);
    }

    if (this.state.falling) {
      this.state.fallTimer += dt;
      this.state.verticalVelocity -= PHYSICS.fallGravity * dt;
      this.state.height += this.state.verticalVelocity * dt;
      this.state.groundPitch = damp(this.state.groundPitch, -0.35, 4, dt);
      this.state.groundRoll = damp(this.state.groundRoll, 0, 4, dt);
      if (
        this.state.fallTimer >= PHYSICS.fallDuration ||
        this.state.height <= -PHYSICS.fallDepth
      ) {
        this.finishFall();
      }
      this.previousDrift = input.drift;
      return;
    }

    const controlsLocked = this.state.spinTimer > 0;
    const targetSurface = this.track.surfaceAt(this.state.pos.x, this.state.pos.z);
    const onIce = targetSurface === "ice";
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
      this.state.height = Math.max(this.state.height, this.groundHeight()) + 0.001;
    }

    const previousContacts = this.wheelPositions();
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
    const surfaceAccelScale =
      lerp(1, PHYSICS.grassAccelScale, this.state.surfaceBlend) *
      (onIce ? PHYSICS.iceAccelScale : 1);

    const engine =
      (braking ? 0 : throttle) *
        PHYSICS.accelBands[band] *
        surfaceAccelScale +
      boostAccel;

    const dragMagnitude =
      PHYSICS.coastDrag * Math.abs(vForward) +
      PHYSICS.rollingResistance +
      PHYSICS.grassExtraRolling * this.state.surfaceBlend +
      PHYSICS.grassExtraDrag * Math.abs(vForward) * this.state.surfaceBlend +
      PHYSICS.iceExtraRolling * (onIce ? 1 : 0) +
      PHYSICS.iceExtraDrag * Math.abs(vForward) * (onIce ? 1 : 0);

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
    if (onIce) {
      grip = PHYSICS.gripIce;
    }
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

    if (
      this.track.holeAt?.(this.state.pos.x, this.state.pos.z) &&
      (this.state.grounded || (this.state.height <= 0.04 && this.state.verticalVelocity <= 0))
    ) {
      this.startFall();
      this.previousDrift = input.drift;
      return;
    }
    if (this.track.isOutOfBounds?.(this.state.pos.x, this.state.pos.z)) {
      this.startFall();
      this.previousDrift = input.drift;
      return;
    }

    const newYaw = this.state.yaw;
    const newForwardX = Math.sin(newYaw);
    const newForwardZ = Math.cos(newYaw);
    const newRightX = -Math.cos(newYaw);
    const newRightZ = Math.sin(newYaw);

    this.state.vForward = this.state.vel.x * newForwardX + this.state.vel.z * newForwardZ;
    this.state.vLateral = this.state.vel.x * newRightX + this.state.vel.z * newRightZ;
    this.state.surface = this.track.surfaceAt(this.state.pos.x, this.state.pos.z);

    this.updateTerrain(dt, previousContacts);

    this.previousDrift = input.drift;
  }

  private wheelPositions(): Array<{ x: number; z: number }> {
    const c = Math.cos(this.state.yaw);
    const s = Math.sin(this.state.yaw);
    return KART_WHEEL_CONTACTS.map((wheel) => ({
      x: this.state.pos.x + c * wheel.x + s * wheel.z,
      z: this.state.pos.z - s * wheel.x + c * wheel.z,
    }));
  }

  private groundContact(): { height: number; pitch: number; roll: number } {
    const center = this.track.heightAt?.(this.state.pos.x, this.state.pos.z) ?? 0;
    const heights = this.wheelPositions().map(({ x, z }) =>
      // Uma roda sem apoio não puxa o chassi para o fundo do buraco.
      this.track.holeAt?.(x, z) ? Math.max(0, center) : (this.track.heightAt?.(x, z) ?? 0),
    );
    const [frontMinusX, frontPlusX, rearMinusX, rearPlusX] = heights;
    const frontWidth = KART_WHEEL_CONTACTS[1].x - KART_WHEEL_CONTACTS[0].x;
    const rearWidth = KART_WHEEL_CONTACTS[3].x - KART_WHEEL_CONTACTS[2].x;
    const wheelbase = KART_WHEEL_CONTACTS[0].z - KART_WHEEL_CONTACTS[2].z;
    const slopeX = ((frontPlusX - frontMinusX) / frontWidth + (rearPlusX - rearMinusX) / rearWidth) / 2;
    const slopeZ = ((frontMinusX + frontPlusX) - (rearMinusX + rearPlusX)) / (2 * wheelbase);
    const pitch = -Math.atan(slopeZ);
    const roll = Math.atan(slopeX * Math.cos(pitch));
    // Eleva o plano de apoio até todas as rodas ficarem acima do terreno.
    // Isso também atende uma única lateral da rampa, sem exigir o centro nela.
    const height = Math.max(...heights.map((h, i) => {
      const wheel = KART_WHEEL_CONTACTS[i];
      const wheelY = Math.cos(pitch) * Math.sin(roll) * wheel.x - Math.sin(pitch) * wheel.z;
      return h - wheelY;
    }));
    return { height, pitch, roll };
  }

  private groundHeight(): number {
    return this.groundContact().height;
  }

  private updateTerrain(dt: number, previousContacts: Array<{ x: number; z: number }>): void {
    const contact = this.groundContact();
    const overHole = this.track.holeAt?.(this.state.pos.x, this.state.pos.z) ?? false;
    if (this.state.grounded) {
      let rise = 0;
      const contacts = this.wheelPositions();
      for (let i = 0; i < contacts.length; i++) {
        const from = previousContacts[i];
        const to = contacts[i];
        rise = Math.max(rise, this.track.rampLaunchAt?.(from.x, from.z, to.x, to.z) ?? 0);
      }
      if (rise > 0 && dt > 0) {
        // A travessia do kicker por qualquer roda dá o impulso na direção
        // real do movimento; sair pela lateral ou descer de ré não lança.
        this.state.grounded = false;
        this.state.verticalVelocity = rise / dt * PHYSICS.rampLaunchScale;
      } else {
        this.state.height = contact.height;
        this.state.groundPitch = contact.pitch;
        this.state.groundRoll = contact.roll;
      }
    }

    if (!this.state.grounded) {
      this.state.verticalVelocity -= PHYSICS.hopGravity * dt;
      this.state.height += this.state.verticalVelocity * dt;
      if (!overHole && this.state.verticalVelocity <= 0 && this.state.height <= contact.height) {
        this.state.height = contact.height;
        this.state.verticalVelocity = 0;
        this.state.grounded = true;
        this.state.groundPitch = contact.pitch;
        this.state.groundRoll = contact.roll;
      } else {
        this.state.groundPitch = damp(this.state.groundPitch, 0, 3, dt);
        this.state.groundRoll = damp(this.state.groundRoll, 0, 3, dt);
      }
    }
  }

  private startFall(): void {
    this.state.falling = true;
    this.state.fallTimer = 0;
    this.state.grounded = false;
    this.state.verticalVelocity = 0;
    this.state.vel.x = 0;
    this.state.vel.z = 0;
    this.state.vForward = 0;
    this.state.vLateral = 0;
    this.state.drifting = false;
    this.state.driftDirection = 0;
    this.state.driftCharge = 0;
    this.state.driftTier = 0;
    this.state.miniTurboTimer = 0;
    this.state.miniTurboTier = 0;
    this.state.spinTimer = 0;
    this.previousDrift = false;
  }

  private finishFall(): void {
    const point =
      this.track.recoveryPoint?.(this.state.pos.x, this.state.pos.z) ??
      this.spawn;
    this.place(point.pos, point.yaw, true);
  }

  private place(pos: { x: number; z: number }, yaw: number, keepLoadout: boolean): void {
    const height = this.track.heightAt?.(pos.x, pos.z) ?? 0;
    this.state.pos.x = pos.x;
    this.state.pos.z = pos.z;
    this.state.vel.x = 0;
    this.state.vel.z = 0;
    this.state.yaw = yaw;
    this.state.steer = 0;
    this.state.steerInput = 0;
    this.state.vForward = 0;
    this.state.vLateral = 0;
    this.state.surface = this.track.surfaceAt(pos.x, pos.z);
    this.state.surfaceBlend = this.state.surface === "grass" ? 1 : 0;
    this.state.height = height;
    this.state.verticalVelocity = 0;
    this.state.grounded = true;
    this.state.falling = false;
    this.state.fallTimer = 0;
    this.state.groundPitch = 0;
    this.state.groundRoll = 0;
    this.state.drifting = false;
    this.state.driftDirection = 0;
    this.state.driftCharge = 0;
    this.state.driftTier = 0;
    this.state.miniTurboTimer = 0;
    this.state.miniTurboTier = 0;
    this.state.spinTimer = 0;
    if (!keepLoadout) {
      this.state.item = null;
      this.state.itemCount = 0;
    }
    this.previousDrift = false;
    this.driftCounterSteerTime = 0;
    const contact = this.groundContact();
    this.state.height = contact.height;
    this.state.groundPitch = contact.pitch;
    this.state.groundRoll = contact.roll;
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
