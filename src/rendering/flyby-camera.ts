import * as THREE from "three";
import { CAMERA, FLY_BY, GROUND_Y } from "../core/config";
import { clamp } from "../core/math";
import type { KartState } from "../core/types";
import type { TrackLike } from "../tracks/track";
import { computeGridCameraPose, type GridCameraPose } from "./grid-camera";

function smootherstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Establishing shot of the circuit: the camera lifts off the grid, circles
 * high above the circuit center looking down at the whole layout, and settles
 * back into the grid pose. It does not follow the road, so corners never jerk
 * the view. Runs on the fixed tick via `advance`, while `apply` poses the
 * camera from the render interpolation.
 */
export class FlyByCamera {
  private elapsed = 0;
  private readonly centerX: number;
  private readonly centerZ: number;
  private readonly orbitRadius: number;
  private readonly orbitY: number;
  private readonly lookY: number;
  private startAngle = 0;
  private direction = 1;
  private readonly gridPose: GridCameraPose = {
    position: new THREE.Vector3(),
    look: new THREE.Vector3(),
  };
  private readonly orbitPosition = new THREE.Vector3();
  private readonly orbitLook = new THREE.Vector3();
  private readonly orbitRotation = new THREE.Quaternion();
  private readonly startPosition = new THREE.Vector3();
  private readonly startRotation = new THREE.Quaternion();
  private readonly gridRotation = new THREE.Quaternion();
  private readonly lookMatrix = new THREE.Matrix4();
  private startFov: number = CAMERA.baseFov;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly track: TrackLike,
    private readonly duration = FLY_BY.duration,
  ) {
    const points = track.path.length > 0 ? track.path : [track.spawn.pos];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let surface = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
      surface = Math.max(surface, track.heightAt?.(point.x, point.z) ?? 0);
    }
    this.centerX = (minX + maxX) / 2;
    this.centerZ = (minZ + maxZ) / 2;
    let radius = 1;
    for (const point of points) {
      radius = Math.max(radius, Math.hypot(point.x - this.centerX, point.z - this.centerZ));
    }
    this.orbitRadius = radius * FLY_BY.orbitRadius;
    this.orbitY =
      GROUND_Y + surface + Math.max(FLY_BY.altitude, radius * FLY_BY.altitudeRatio);
    this.lookY = GROUND_Y + FLY_BY.lookHeight;
  }

  start(state: Pick<KartState, "pos" | "yaw">): void {
    this.elapsed = 0;
    this.startPosition.copy(this.camera.position);
    this.startRotation.copy(this.camera.quaternion);
    this.startFov = this.camera.fov;
    computeGridCameraPose(state, this.camera.aspect, 0, this.gridPose);
    this.gridRotation.setFromRotationMatrix(
      this.lookMatrix.lookAt(this.gridPose.position, this.gridPose.look, this.camera.up),
    );
    // Begin the orbit on the grid's side of the circuit and turn the same way
    // the karts race, so the lift-off never cuts across the layout.
    this.startAngle = Math.atan2(
      this.gridPose.position.z - this.centerZ,
      this.gridPose.position.x - this.centerX,
    );
    const tangentX = -Math.sin(this.startAngle);
    const tangentZ = Math.cos(this.startAngle);
    this.direction =
      tangentX * Math.sin(state.yaw) + tangentZ * Math.cos(state.yaw) < 0 ? -1 : 1;
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
    this.orbitPose(progress);

    this.camera.position.lerpVectors(this.startPosition, this.orbitPosition, lift)
      .lerp(this.gridPose.position, settle);
    // Blend orientations, rather than moving a look target past the camera.
    this.camera.quaternion.slerpQuaternions(this.startRotation, this.orbitRotation, lift)
      .slerp(this.gridRotation, settle);
    const airborneFov = this.startFov + (CAMERA.baseFov + FLY_BY.fovBoost - this.startFov) * lift;
    this.setFov(airborneFov + (CAMERA.baseFov - airborneFov) * settle);
  }

  /** High point on a circle around the circuit center, looking at the center. */
  private orbitPose(progress: number): void {
    const angle = this.startAngle + this.direction * FLY_BY.turns * Math.PI * 2 * progress;
    this.orbitPosition.set(
      this.centerX + Math.cos(angle) * this.orbitRadius,
      this.orbitY,
      this.centerZ + Math.sin(angle) * this.orbitRadius,
    );
    this.orbitLook.set(this.centerX, this.lookY, this.centerZ);
    this.orbitRotation.setFromRotationMatrix(
      this.lookMatrix.lookAt(this.orbitPosition, this.orbitLook, this.camera.up),
    );
  }

  private setFov(fov: number): void {
    if (Math.abs(this.camera.fov - fov) > 0.0001) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
