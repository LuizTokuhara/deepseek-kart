import { PHYSICS } from "./config";
import { clamp, damp, lerp, moveToward } from "./math";
import { CollisionWorld } from "./collision";
import type { DriveInput, KartState, Spawn, SurfaceProvider } from "./types";

export class Kart {
  readonly state: KartState;

  private readonly spawn: Spawn;
  private readonly track: SurfaceProvider;
  private readonly collision: CollisionWorld;

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
      vForward: 0,
      vLateral: 0,
      surface: "asphalt",
      surfaceBlend: 0,
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
    this.state.vForward = 0;
    this.state.vLateral = 0;
    this.state.surface = this.track.surfaceAt(this.state.pos.x, this.state.pos.z);
    this.state.surfaceBlend = this.state.surface === "grass" ? 1 : 0;
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
    this.state.vForward = 0;
    this.state.vLateral = 0;
    this.state.surface = this.track.surfaceAt(x, z);
    this.state.surfaceBlend = this.state.surface === "grass" ? 1 : 0;
  }

  update(dt: number, input: DriveInput): void {
    const targetSurface = this.track.surfaceAt(this.state.pos.x, this.state.pos.z);
    this.state.surface = targetSurface;
    this.state.surfaceBlend = damp(
      this.state.surfaceBlend,
      targetSurface === "grass" ? 1 : 0,
      PHYSICS.surfaceBlend,
      dt,
    );

    const targetSteer = clamp(input.steer, -1, 1);
    this.state.steer = damp(this.state.steer, targetSteer, PHYSICS.steerSmooth, dt);

    const yaw = this.state.yaw;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    let vForward = this.state.vel.x * forwardX + this.state.vel.z * forwardZ;
    let vLateral = this.state.vel.x * rightX + this.state.vel.z * rightZ;

    const throttle = clamp(input.throttle, 0, 1);
    const brake = clamp(input.brake, 0, 1);
    const braking = brake > 0.01;

    const speedRatio = clamp(Math.abs(vForward) / PHYSICS.topSpeed, 0, 1);
    const band = clamp(Math.floor(speedRatio * 10), 0, 9);

    const engine =
      (braking ? 0 : throttle) *
      PHYSICS.accelBands[band] *
      lerp(1, PHYSICS.grassAccelScale, this.state.surfaceBlend);

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
        vForward = moveToward(vForward, -PHYSICS.reverseSpeed, PHYSICS.reverseAccel * dt);
      }
    }

    vForward = clamp(vForward, -PHYSICS.reverseSpeed, PHYSICS.topSpeed);

    const grip = lerp(PHYSICS.gripAsphalt, PHYSICS.gripGrass, this.state.surfaceBlend);
    vLateral *= Math.exp(-grip * dt);

    // Recomposição com o yaw atual. A mudança de yaw acontece depois, o que
    // cria naturalmente um pequeno escorregamento lateral.
    this.state.vel.x = forwardX * vForward + rightX * vLateral;
    this.state.vel.z = forwardZ * vForward + rightZ * vLateral;

    const speedFactor = clamp(Math.abs(vForward) / PHYSICS.turnSpeedRef, 0, 1);
    const topSpeedFactor =
      1 - PHYSICS.turnSpeedFalloff * clamp(Math.abs(vForward) / PHYSICS.topSpeed, 0, 1);
    const turnRate = PHYSICS.maxTurnRate * speedFactor * topSpeedFactor;
    const reverseSign = vForward < -0.01 ? -1 : 1;

    this.state.yaw += this.state.steer * turnRate * dt * reverseSign;

    this.integrate(dt);

    const newYaw = this.state.yaw;
    const newForwardX = Math.sin(newYaw);
    const newForwardZ = Math.cos(newYaw);
    const newRightX = Math.cos(newYaw);
    const newRightZ = -Math.sin(newYaw);

    this.state.vForward = this.state.vel.x * newForwardX + this.state.vel.z * newForwardZ;
    this.state.vLateral = this.state.vel.x * newRightX + this.state.vel.z * newRightZ;
    this.state.surface = this.track.surfaceAt(this.state.pos.x, this.state.pos.z);
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
