import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FLY_BY, GROUND_Y } from "../src/core/config";
import { CollisionWorld } from "../src/core/collision";
import { ChaseCamera } from "../src/rendering/chase-camera";
import { FlyByCamera } from "../src/rendering/flyby-camera";
import { computeGridCameraPose } from "../src/rendering/grid-camera";
import { meadowLayout } from "../src/tracks/courses/meadow-loop/layout";
import { courses } from "../src/tracks/registry";
import { Track } from "../src/tracks/track";

function setup() {
  const track = new Track(meadowLayout);
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 500);
  const player = { pos: track.spawn.pos, yaw: track.spawn.yaw };
  const grid = computeGridCameraPose(player, camera.aspect, 0, {
    position: new THREE.Vector3(), look: new THREE.Vector3(),
  });
  camera.position.copy(grid.position);
  camera.lookAt(grid.look);
  const flyBy = new FlyByCamera(camera, track);
  return { track, camera, flyBy, player };
}

describe("flyby camera", () => {
  it("starts and ends in the grid pose", () => {
    const { camera, flyBy, player } = setup();
    flyBy.start(player);

    const start = camera.position.clone();
    expect(start.y).toBeLessThan(8);
    expect(
      Math.hypot(start.x - player.pos.x, start.z - player.pos.z),
    ).toBeGreaterThan(8);

    let done = false;
    for (let step = 0; step < 1000 && !done; step++) {
      done = flyBy.advance(1 / 60);
    }
    expect(done).toBe(true);

    flyBy.apply(0);
    expect(camera.position.y).toBeLessThan(8);
    expect(
      Math.hypot(camera.position.x - player.pos.x, camera.position.z - player.pos.z),
    ).toBeLessThan(30);
  });

  it("climbs over the circuit and returns to the grid", () => {
    const { camera, flyBy, player, track } = setup();
    flyBy.start(player);

    let maxHeight = -Infinity;
    let maxDistance = 0;
    const steps = 240;
    for (let step = 0; step < steps; step++) {
      flyBy.advance(FLY_BY.duration / steps);
      flyBy.apply(0);
      expect(Number.isFinite(camera.position.x)).toBe(true);
      expect(Number.isFinite(camera.position.y)).toBe(true);
      expect(Number.isFinite(camera.position.z)).toBe(true);
      maxHeight = Math.max(maxHeight, camera.position.y);
      maxDistance = Math.max(
        maxDistance,
        Math.hypot(camera.position.x - player.pos.x, camera.position.z - player.pos.z),
      );
    }

    expect(maxHeight).toBeGreaterThan(FLY_BY.altitude * 0.8);
    expect(maxDistance).toBeGreaterThan(40);
    expect(
      camera.position.y - (GROUND_Y + (track.heightAt?.(camera.position.x, camera.position.z) ?? 0)),
    ).toBeLessThan(8);
  });

  it("circles the circuit center instead of following the road", () => {
    const { camera, flyBy, player, track } = setup();
    const xs = track.path.map((point) => point.x);
    const zs = track.path.map((point) => point.z);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
    flyBy.start(player);

    const forward = new THREE.Vector3();
    const radii: number[] = [];
    let swept = 0;
    let previousAngle: number | undefined;
    const steps = 200;
    for (let step = 0; step <= steps; step++) {
      const progress = FLY_BY.lift + (1 - FLY_BY.lift - FLY_BY.settle) * (step / steps);
      flyBy.apply(progress * FLY_BY.duration);
      const dx = camera.position.x - centerX;
      const dz = camera.position.z - centerZ;
      radii.push(Math.hypot(dx, dz));
      camera.getWorldDirection(forward);
      // The view stays aimed at the circuit center, not at the next corner.
      expect(Math.hypot(forward.x, forward.z)).toBeGreaterThan(0.1);
      expect((forward.x * -dx + forward.z * -dz) / (Math.hypot(forward.x, forward.z) * radii[step]))
        .toBeGreaterThan(0.999);
      const angle = Math.atan2(dz, dx);
      if (previousAngle !== undefined) {
        swept += Math.abs(Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle)));
      }
      previousAngle = angle;
    }

    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.01);
    expect(swept).toBeGreaterThan(Math.PI);
  });

  it("preserves the actual intro pose and lands exactly on the grid", () => {
    const { camera, flyBy, player } = setup();
    const endPosition = camera.position.clone();
    const endRotation = camera.quaternion.clone();
    camera.position.x += 0.9;
    camera.rotateY(0.04);
    const startPosition = camera.position.clone();
    const startRotation = camera.quaternion.clone();
    flyBy.start(player);
    expect(camera.position.distanceTo(startPosition)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(startRotation)).toBeLessThan(1e-7);
    flyBy.apply(1 / 60);
    expect(camera.position.distanceTo(startPosition)).toBeLessThan(0.001);
    expect(camera.quaternion.angleTo(startRotation)).toBeLessThan(0.001);
    flyBy.advance(FLY_BY.duration);
    flyBy.apply(0);
    expect(camera.position.distanceTo(endPosition)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(endRotation)).toBeLessThan(1e-7);
  });

  it("evaluates the same pose regardless of frame rate or previous renders", () => {
    const { camera, flyBy, player } = setup();
    flyBy.start(player);
    flyBy.apply(FLY_BY.duration * 0.52);
    const position = camera.position.clone();
    const rotation = camera.quaternion.clone();
    flyBy.apply(FLY_BY.duration * 0.13);
    flyBy.apply(FLY_BY.duration * 0.91);
    flyBy.apply(FLY_BY.duration * 0.52);
    expect(camera.position.distanceTo(position)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
  });

  it("eases into the chase camera without snapping on the first countdown frame", () => {
    const { camera, flyBy, player } = setup();
    const chase = new ChaseCamera(camera);
    chase.reset(player);
    flyBy.start(player);
    flyBy.advance(FLY_BY.duration);
    flyBy.apply(0);
    const position = camera.position.clone();
    const rotation = camera.quaternion.clone();
    chase.easeFromCurrentPose();
    const target = { ...player, speed: 0, steer: 0, vLateral: 0, height: 0,
      drifting: false, driftDirection: 0 as const, boosting: false };
    const collision = new CollisionWorld([]);
    chase.update(1 / 60, target, collision);
    expect(camera.position.distanceTo(position)).toBeLessThan(0.002);
    expect(camera.quaternion.angleTo(rotation)).toBeLessThan(0.002);
    for (let i = 0; i < 180; i++) chase.update(1 / 60, target, collision);
    const settled = camera.position.clone();
    chase.reset(player);
    expect(camera.position.distanceTo(settled)).toBeLessThan(0.01);
  });

  it.each(courses)("keeps the flight continuous on $layout.id", (course) => {
    const track = new Track(course.layout);
    const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 500);
    const player = { pos: track.spawn.pos, yaw: track.spawn.yaw };
    const grid = computeGridCameraPose(player, camera.aspect, 0, {
      position: new THREE.Vector3(), look: new THREE.Vector3(),
    });
    camera.position.copy(grid.position);
    camera.lookAt(grid.look);
    const flyBy = new FlyByCamera(camera, track);
    flyBy.start(player);
    const previousPosition = camera.position.clone();
    const previousRotation = camera.quaternion.clone();
    const previousVelocity = new THREE.Vector3();
    const velocity = new THREE.Vector3();
    let maxAngle = 0;
    let maxVelocityChange = 0;
    const fps = 120;
    for (let frame = 1; frame <= FLY_BY.duration * fps; frame++) {
      flyBy.apply(frame / fps);
      velocity.copy(camera.position).sub(previousPosition).multiplyScalar(fps);
      maxVelocityChange = Math.max(maxVelocityChange, velocity.distanceTo(previousVelocity));
      maxAngle = Math.max(maxAngle, camera.quaternion.angleTo(previousRotation));
      previousPosition.copy(camera.position);
      previousRotation.copy(camera.quaternion);
      previousVelocity.copy(velocity);
    }
    expect(maxAngle).toBeLessThan(0.05);
    expect(maxVelocityChange).toBeLessThan(5);
  });
});
