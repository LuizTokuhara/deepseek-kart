import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Snowfall } from "../src/rendering/snowfall";
import { Environment } from "../src/rendering/environment";
import { vanillaLakeEnvironment } from "../src/tracks/courses/vanilla-lake/environment";
import { meadowEnvironment } from "../src/tracks/courses/meadow-loop/environment";
import { ChaseCamera } from "../src/rendering/chase-camera";
import { CollisionWorld } from "../src/core/collision";
import type { CameraTarget } from "../src/core/types";

const target: CameraTarget = {
  pos: { x: 0, z: 0 }, yaw: 0, speed: 0, steer: 0, vLateral: 0,
  height: 0, drifting: false, driftDirection: 0, boosting: false,
};

describe("efeitos de inverno", () => {
  it("ativa a neve só nos ambientes que a solicitam", () => {
    for (const definition of [vanillaLakeEnvironment, meadowEnvironment]) {
      const scene = new THREE.Scene();
      const environment = new Environment(scene, definition);
      environment.update(1 / 60, new THREE.Vector3(10, 3, -7), 720);
      expect(Boolean(scene.getObjectByName("winter-snowfall"))).toBe(definition === vanillaLakeEnvironment);
    }
  });

  it("respeita movimento reduzido e reposiciona o volume sem recriar partículas", () => {
    const snow = new Snowfall({ count: 520, radius: 30 });
    const positions = snow.points.geometry.getAttribute("position");
    const anchor = new THREE.Vector3(85, 4, -77);
    snow.update(1 / 60, anchor, 720, true);
    expect(snow.points.visible).toBe(false);
    expect(snow.points.material.uniforms.elapsed.value).toBe(0);
    snow.update(1 / 60, anchor, 720, false);
    expect(snow.points.visible).toBe(true);
    expect(snow.points.material.uniforms.anchor.value.distanceTo(anchor)).toBe(0);
    expect(snow.points.geometry.getAttribute("position")).toBe(positions);
    expect(positions.count).toBe(520);
  });
});

describe("reação da câmera ao pouso", () => {
  it.each([1 / 30, 1 / 60, 1 / 120])("absorve o impacto e volta à posição original em dt=%s", (dt) => {
    const camera = new THREE.PerspectiveCamera();
    const chase = new ChaseCamera(camera);
    const collision = new CollisionWorld([]);
    chase.reset(target);
    const original = camera.position.clone();
    chase.land(6);
    let lowest = original.y;
    for (let i = 0; i < 3 / dt; i++) {
      chase.update(dt, target, collision);
      lowest = Math.min(lowest, camera.position.y);
    }
    expect(lowest).toBeLessThan(original.y - 0.025);
    expect(lowest).toBeGreaterThan(original.y - 0.18);
    expect(camera.position.distanceTo(original)).toBeLessThan(0.001);
    chase.land(8);
    chase.update(dt, target, collision);
    chase.reset(target);
    chase.update(dt, target, collision);
    expect(camera.position.distanceTo(original)).toBeLessThan(0.001);
  });
});
