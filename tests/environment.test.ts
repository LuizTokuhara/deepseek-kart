import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Environment, type EnvironmentDefinition } from "../src/rendering/environment";
import { racewayEnvironment } from "../src/tracks/courses/deepseek-raceway/environment";
import { meadowEnvironment } from "../src/tracks/courses/meadow-loop/environment";

const verticalSun: EnvironmentDefinition = {
  ...racewayEnvironment,
  sun: { ...racewayEnvironment.sun, offset: { x: 0, y: 60, z: 0 } },
};

describe.each([
  { name: "Raceway", definition: racewayEnvironment },
  { name: "Meadow", definition: meadowEnvironment },
  { name: "vertical sun", definition: verticalSun },
])("$name moving shadows", ({ definition }) => {
  it("keeps a static world point on the same texel grid as the kart moves", () => {
    const scene = new THREE.Scene();
    const environment = new Environment(scene, definition);
    const { sun } = environment;
    const worldPoint = new THREE.Vector3(12, 2, -8);
    const project = (x: number, z: number) => {
      environment.follow(x, z);
      scene.updateMatrixWorld(true);
      sun.shadow.updateMatrices(sun);
      return worldPoint.clone().applyMatrix4(sun.shadow.matrix)
        .multiply(new THREE.Vector3(sun.shadow.mapSize.x, sun.shadow.mapSize.y, 1));
    };
    const origin = project(0, 0);
    // Sub-texel motion, diagonal travel, negative coordinates and a teleport.
    for (const [x, z] of [[0.001, 0.002], [0.03, -0.07], [-23.29, 31.41], [65, -19]]) {
      const projected = project(x, z);
      for (const axis of ["x", "y"] as const) {
        const delta = projected[axis] - origin[axis];
        expect(Math.abs(delta - Math.round(delta))).toBeLessThan(0.000001);
      }
      const direction = sun.position.clone().sub(sun.target.position);
      expect(direction.x).toBeCloseTo(definition.sun.offset.x, 10);
      expect(direction.y).toBeCloseTo(definition.sun.offset.y, 10);
      expect(direction.z).toBeCloseTo(definition.sun.offset.z, 10);
      // Stabilization must not let the shadow volume lag behind the kart.
      expect(sun.target.position.distanceTo(new THREE.Vector3(x, 0, z))).toBeLessThan(0.03);
    }
  });
});
