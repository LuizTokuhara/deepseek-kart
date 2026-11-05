import * as THREE from "three";
import { CAMERA, GROUND_Y, PHYSICS } from "./config";
import { clamp, damp } from "./math";
import type { CameraTarget } from "./types";
import type { CollisionWorld } from "./collision";

type CameraPose = Pick<CameraTarget, "pos" | "yaw"> &
  Partial<Pick<CameraTarget, "height" | "drifting" | "driftDirection">>;

export class ChaseCamera {
  private readonly lookTarget = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera) {
    this.camera.fov = CAMERA.baseFov;
    this.camera.updateProjectionMatrix();
  }

  reset(target: CameraPose): void {
    this.computeDesired(target);
    this.camera.position.copy(this.desiredPosition);
    this.lookTarget.copy(this.desiredLook);
    this.camera.fov = CAMERA.baseFov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.lookTarget);
  }

  update(dt: number, target: CameraTarget, collision: CollisionWorld): void {
    this.computeDesired(target);

    this.rayOrigin.set(
      target.pos.x,
      GROUND_Y + 1.2 + target.height * 0.5,
      target.pos.z,
    );
    this.rayDirection.copy(this.desiredPosition).sub(this.rayOrigin);
    const distance = this.rayDirection.length();

    let constrained = false;

    if (distance > 0.001) {
      this.rayDirection.divideScalar(distance);
      const hit = collision.raycast(
        this.rayOrigin.x,
        this.rayOrigin.y,
        this.rayOrigin.z,
        this.rayDirection.x,
        this.rayDirection.y,
        this.rayDirection.z,
        distance,
      );

      if (hit !== null && hit < distance) {
        const safeDistance = Math.max(CAMERA.minDistance, hit - CAMERA.collisionMargin);
        this.desiredPosition.copy(this.rayOrigin).addScaledVector(this.rayDirection, safeDistance);
        constrained = true;
      }
    }

    const positionLambda = constrained ? 20 : CAMERA.positionLambda;
    this.camera.position.lerp(this.desiredPosition, 1 - Math.exp(-positionLambda * dt));
    this.lookTarget.lerp(this.desiredLook, 1 - Math.exp(-CAMERA.lookLambda * dt));

    const speedRatio = clamp(target.speed / PHYSICS.topSpeed, 0, 1);
    const targetFov = CAMERA.baseFov + CAMERA.speedFov * speedRatio;
    this.camera.fov = damp(this.camera.fov, targetFov, 4, dt);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.lookTarget);
  }

  private computeDesired(target: CameraPose): void {
    const height = target.height ?? 0;
    const lean = target.drifting
      ? (target.driftDirection ?? 0) * (6 * Math.PI / 180)
      : 0;
    const viewYaw = target.yaw + lean;
    const sin = Math.sin(viewYaw);
    const cos = Math.cos(viewYaw);

    this.desiredPosition.set(
      target.pos.x - CAMERA.distance * sin,
      GROUND_Y + CAMERA.height + height * 0.5,
      target.pos.z - CAMERA.distance * cos,
    );

    this.desiredLook.set(
      target.pos.x + CAMERA.lookAhead * sin,
      GROUND_Y + CAMERA.lookHeight + height * 0.7,
      target.pos.z + CAMERA.lookAhead * cos,
    );
  }
}
