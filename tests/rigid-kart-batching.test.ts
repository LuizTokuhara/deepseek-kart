import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { mergeRigidMeshes } from "../src/actors/kart/merge-rigid-meshes";
import { KartModel, PLAYER_PALETTE } from "../src/actors/kart/kart-model";

describe("rigid kart batching", () => {
  it("preserves transformed bodywork and independently animated steering", () => {
    const root = new THREE.Group();
    root.position.set(3, 1, -4);
    root.rotation.y = 0.4;
    const paint = new THREE.MeshBasicMaterial();
    const nested = new THREE.Group();
    nested.rotation.x = 0.6;
    nested.position.set(0.4, 0.8, 0);
    root.add(nested);
    for (const parent of [root, nested]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 2), paint);
      mesh.position.z = -0.7;
      parent.add(mesh);
    }
    const steering = new THREE.Group();
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2), paint);
    steering.add(wheel);
    root.add(steering);
    root.updateMatrixWorld(true);
    const before = new THREE.Box3().setFromObject(root, true);

    mergeRigidMeshes(root, [steering]);
    root.updateMatrixWorld(true);
    const after = new THREE.Box3().setFromObject(root, true);
    expect(after.min.distanceTo(before.min)).toBeLessThan(0.00001);
    expect(after.max.distanceTo(before.max)).toBeLessThan(0.00001);
    expect(steering.children).toEqual([wheel]);
    expect(wheel.parent).toBe(steering);
    steering.rotation.z = 0.8;
    root.updateMatrixWorld(true);
    expect(wheel.matrixWorld.equals(root.matrixWorld)).toBe(false);
    const batch = root.getObjectByName("rigid-batch") as THREE.Mesh;
    expect(batch.material).toBe(paint);
    expect(batch.geometry.getAttribute("position").count).toBe(72);
  });

  it("keeps the complete kart within a bounded draw budget before ink and effects", () => {
    const model = new KartModel(PLAYER_PALETTE);
    let meshes = 0;
    model.group.traverse(object => { if (object instanceof THREE.Mesh) meshes++; });
    expect(meshes).toBeLessThanOrEqual(32);
    for (const axle of ["front", "rear"]) {
      for (const side of ["left", "right"]) {
        expect(model.group.getObjectByName(`${axle}-wheel-${side}`)).toBeDefined();
      }
    }
  });
});
