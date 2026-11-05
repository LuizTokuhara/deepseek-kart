import * as THREE from "three";
import { CAMERA, GROUND_Y, PHYSICS } from "./config";
import { clamp, damp } from "./math";
import type { CameraTarget } from "./types";
import type { CollisionWorld } from "./collision";

type CameraPose = Pick<CameraTarget, "pos" | "yaw"> &
  Partial<
    Pick<CameraTarget, "height" | "drifting" | "driftDirection" | "boosting">
  >;

export class ChaseCamera {
  private readonly lookTarget = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();
  private readonly shakeRight = new THREE.Vector3();
  private readonly shakeUp = new THREE.Vector3();
  private roll = 0;
  private shakeTime = 0;
  private shakeDuration = 0;
  private shakeStrength = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    this.camera.fov = CAMERA.baseFov;
    this.camera.updateProjectionMatrix();
  }

  reset(target: CameraPose): void {
    this.computeDesired(target);
    this.camera.position.copy(this.desiredPosition);
    this.lookTarget.copy(this.desiredLook);
    this.roll = 0;
    this.shakeTime = 0;
    this.camera.fov = CAMERA.baseFov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.lookTarget);
  }

  shake(strength: number, duration = 0.25): void {
    this.shakeStrength = Math.max(
      this.shakeTime > 0
        ? this.shakeStrength * (this.shakeTime / this.shakeDuration)
        : 0,
      strength,
    );
    this.shakeDuration = duration;
    this.shakeTime = duration;
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
    const targetFov =
      CAMERA.baseFov +
      CAMERA.speedFov * speedRatio +
      (target.boosting ? CAMERA.boostFov : 0);
    this.camera.fov = damp(this.camera.fov, targetFov, target.boosting ? 12 : 4, dt);
    this.camera.updateProjectionMatrix();

    const targetRoll = target.drifting
      ? -target.driftDirection * CAMERA.driftRoll
      : 0;
    this.roll = damp(this.roll, targetRoll, 10, dt);

    this.camera.lookAt(this.lookTarget);
    this.camera.rotateZ(this.roll);

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const fade = this.shakeDuration > 0
        ? this.shakeTime / this.shakeDuration
        : 0;
      const seconds = performance.now() * 0.001;
      const strength = this.shakeStrength * fade;
      this.shakeRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      this.shakeUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.camera.position.addScaledVector(
        this.shakeRight,
        Math.sin(seconds * 97) * strength,
      );
      this.camera.position.addScaledVector(
        this.shakeUp,
        Math.cos(seconds * 83) * strength * 0.7,
      );
      this.camera.rotateZ(Math.sin(seconds * 67) * 0.02 * fade);
    }
  }

  private computeDesired(target: CameraPose): void {
    const height = target.height ?? 0;
    const boosting = target.boosting ?? false;
    const distance = CAMERA.distance + (boosting ? CAMERA.boostDistance : 0);
    const lookAhead = CAMERA.lookAhead + (boosting ? CAMERA.boostLookAhead : 0);
    const lean = target.drifting
      ? (target.driftDirection ?? 0) * CAMERA.driftYaw
      : 0;
    const viewYaw = target.yaw + lean;
    const sin = Math.sin(viewYaw);
    const cos = Math.cos(viewYaw);

    this.desiredPosition.set(
      target.pos.x - distance * sin,
      GROUND_Y + CAMERA.height + height * 0.5,
      target.pos.z - distance * cos,
    );

    this.desiredLook.set(
      target.pos.x + lookAhead * sin,
      GROUND_Y + CAMERA.lookHeight + height * 0.7,
      target.pos.z + lookAhead * cos,
    );
  }
}
