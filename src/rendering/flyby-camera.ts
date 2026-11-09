import * as THREE from "three";
import { CAMERA, FLY_BY, GROUND_Y } from "../core/config";
import { clamp, shortestAngleDelta } from "../core/math";
import type { KartState } from "../core/types";
import type { TrackLike } from "../tracks/track";
import { computeGridCameraPose, type GridCameraPose } from "./grid-camera";

interface RouteSample {
  x: number;
  z: number;
  yaw: number;
}

interface FlightPose {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
}

function smootherstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Drone shot over the circuit: it lifts off the grid, follows the centerline
 * for one lap, and settles back into the grid pose. Runs on the fixed tick via
 * `advance`, while `apply` poses the camera from the render interpolation.
 */
export class FlyByCamera {
  private elapsed = 0;
  private readonly lapLength: number;
  private readonly spawnProgress: number;
  private readonly gridPose: GridCameraPose = {
    position: new THREE.Vector3(),
    look: new THREE.Vector3(),
  };
  private readonly dronePosition = new THREE.Vector3();
  private readonly droneLook = new THREE.Vector3();
  private readonly droneRotation = new THREE.Quaternion();
  private readonly startPosition = new THREE.Vector3();
  private readonly startRotation = new THREE.Quaternion();
  private readonly gridRotation = new THREE.Quaternion();
  private startFov: number = CAMERA.baseFov;
  private readonly flight: FlightPose[];
  private readonly trailing = { x: 0, z: 0, yaw: 0 };
  private readonly ahead = { x: 0, z: 0, yaw: 0 };

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly track: TrackLike,
    private readonly duration = FLY_BY.duration,
  ) {
    this.lapLength = Math.max(1, track.path.length * track.pathSpacing);
    this.spawnProgress =
      track.path.length > 0
        ? track.nearestPathIndex(track.spawn.pos.x, track.spawn.pos.z) /
          track.path.length
        : 0;
    this.flight = this.buildFlight();
  }

  start(state: Pick<KartState, "pos" | "yaw">): void {
    this.elapsed = 0;
    this.startPosition.copy(this.camera.position);
    this.startRotation.copy(this.camera.quaternion);
    this.startFov = this.camera.fov;
    computeGridCameraPose(state, this.camera.aspect, 0, this.gridPose);
    this.gridRotation.setFromRotationMatrix(
      new THREE.Matrix4().lookAt(this.gridPose.position, this.gridPose.look, this.camera.up),
    );
    this.apply(0);
  }

  /** Advances the shot clock. Returns true on the tick the flyover ends. */
  advance(dt: number): boolean {
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    return this.elapsed >= this.duration;
  }

  /** Poses the camera for the current clock plus `extraSeconds` of interpolation. */
  apply(extraSeconds: number): void {
    const progress =
      this.duration > 0
        ? clamp((this.elapsed + extraSeconds) / this.duration, 0, 1)
        : 1;
    const lift = smootherstep01(progress / FLY_BY.lift);
    const settle = smootherstep01((progress - (1 - FLY_BY.settle)) / FLY_BY.settle);
    const scaled = progress * this.flight.length;
    const index = Math.floor(scaled) % this.flight.length;
    const next = (index + 1) % this.flight.length;
    const fraction = scaled - Math.floor(scaled);
    this.dronePosition.lerpVectors(this.flight[index].position, this.flight[next].position, fraction);
    this.droneRotation.slerpQuaternions(this.flight[index].rotation, this.flight[next].rotation, fraction);

    this.camera.position.lerpVectors(this.startPosition, this.dronePosition, lift)
      .lerp(this.gridPose.position, settle);
    // Blend orientations, rather than moving a look target past the camera.
    this.camera.quaternion.slerpQuaternions(this.startRotation, this.droneRotation, lift)
      .slerp(this.gridRotation, settle);
    const airborneFov = this.startFov + (CAMERA.baseFov + FLY_BY.fovBoost - this.startFov) * lift;
    this.setFov(airborneFov + (CAMERA.baseFov - airborneFov) * settle);
  }

  private dronePose(progress: number, out: THREE.PerspectiveCamera): void {
    const route = this.spawnProgress + progress;
    this.sample(route - FLY_BY.back / this.lapLength, this.trailing);
    this.sample(route + FLY_BY.lookAhead / this.lapLength, this.ahead);

    const sway = Math.sin(progress * Math.PI * 4) * FLY_BY.sway;
    const altitude =
      FLY_BY.altitude +
      Math.sin(progress * Math.PI * 2) * FLY_BY.altitudeVariation +
      Math.sin(progress * Math.PI * 6) * 0.35;
    const rightX = -Math.cos(this.trailing.yaw);
    const rightZ = Math.sin(this.trailing.yaw);

    this.dronePosition.set(
      this.trailing.x + rightX * sway,
      GROUND_Y + this.surfaceAt(this.trailing.x, this.trailing.z) + altitude,
      this.trailing.z + rightZ * sway,
    );
    this.droneLook.set(
      this.ahead.x,
      GROUND_Y + this.surfaceAt(this.ahead.x, this.ahead.z) + FLY_BY.lookHeight,
      this.ahead.z,
    );

    out.position.copy(this.dronePosition);
    out.lookAt(this.droneLook);
    const turn = shortestAngleDelta(this.trailing.yaw, this.ahead.yaw);
    out.rotateZ(-clamp(turn * 0.35, -0.12, 0.12));
  }

  /** Bake a symmetric filter once; rendering only interpolates two cached poses. */
  private buildFlight(): FlightPose[] {
    const count = Math.max(120, Math.ceil(this.duration * 60));
    const raw: FlightPose[] = [];
    const pose = new THREE.PerspectiveCamera();
    for (let i = 0; i < count; i++) {
      this.dronePose(i / count, pose);
      raw.push({ position: pose.position.clone(), rotation: pose.quaternion.clone() });
    }
    const sigma = FLY_BY.smoothing * count / Math.max(this.duration, 0.001);
    const radius = Math.min(Math.ceil(sigma * 3), Math.floor(count / 2));
    return raw.map((center, i) => {
      const position = new THREE.Vector3();
      const rotation = new THREE.Vector4(0, 0, 0, 0);
      let total = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const sample = raw[(i + offset + count) % count];
        const weight = Math.exp(-0.5 * (offset / sigma) ** 2);
        position.addScaledVector(sample.position, weight);
        // q and -q describe the same orientation; align signs before averaging.
        const sign = center.rotation.dot(sample.rotation) < 0 ? -1 : 1;
        rotation.x += sample.rotation.x * weight * sign;
        rotation.y += sample.rotation.y * weight * sign;
        rotation.z += sample.rotation.z * weight * sign;
        rotation.w += sample.rotation.w * weight * sign;
        total += weight;
      }
      return {
        position: position.divideScalar(total),
        rotation: new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).normalize(),
      };
    });
  }

  private sample(progress: number, out: RouteSample): void {
    const count = this.track.path.length;
    if (count === 0) {
      out.x = this.track.spawn.pos.x;
      out.z = this.track.spawn.pos.z;
      out.yaw = this.track.spawn.yaw;
      return;
    }

    const wrapped = ((progress % 1) + 1) % 1;
    const scaled = wrapped * count;
    const index = Math.floor(scaled) % count;
    const next = (index + 1) % count;
    const fraction = scaled - Math.floor(scaled);
    const a = this.track.path[index];
    const b = this.track.path[next];

    out.x = a.x + (b.x - a.x) * fraction;
    out.z = a.z + (b.z - a.z) * fraction;
    const from = this.track.pathYaw(index);
    out.yaw =
      from + shortestAngleDelta(from, this.track.pathYaw(next)) * fraction;
  }

  private surfaceAt(x: number, z: number): number {
    return this.track.heightAt?.(x, z) ?? 0;
  }

  private setFov(fov: number): void {
    if (Math.abs(this.camera.fov - fov) > 0.0001) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
