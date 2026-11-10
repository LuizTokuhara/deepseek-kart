import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createItemModel, createOilSlickModel, HeldItemDisplay } from "../src/items/item-model";
import { MISSILE_FLAME } from "../src/items/models/missile-model";
import type { ItemType } from "../src/core/types";

const ITEMS: ItemType[] = ["oil-can", "missile", "red-missile", "lightning"];

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) found.push(object as THREE.Mesh);
  });
  return found;
}

function size(root: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
}

describe("item models", () => {
  it.each(ITEMS)("builds %s as a few merged meshes standing on the ground", (type) => {
    const model = createItemModel(type);
    const parts = meshes(model);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.length).toBeLessThanOrEqual(7);
    const box = new THREE.Box3().setFromObject(model);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(size(model).length()).toBeLessThan(1.8);
  });

  it("shares geometry and materials between clones", () => {
    const [a, b] = [createItemModel("missile"), createItemModel("missile")];
    const [meshA, meshB] = [meshes(a)[0], meshes(b)[0]];
    expect(meshA).not.toBe(meshB);
    expect(meshA.geometry).toBe(meshB.geometry);
    expect(meshA.material).toBe(meshB.material);
  });

  it("points the missile nose to +Z with the flame behind the nozzle", () => {
    const missile = createItemModel("red-missile");
    const flame = missile.getObjectByName(MISSILE_FLAME)!;
    const hull = new THREE.Box3().setFromObject(missile);
    const exhaust = new THREE.Box3().setFromObject(flame);
    expect(hull.max.z).toBeGreaterThan(0.5);
    expect(exhaust.max.z).toBeLessThan(-0.4);
  });

  it("does not light the flame of held missiles", () => {
    const held = new HeldItemDisplay();
    held.update("missile", 3, 0.016);
    const flames = held.group.children.map((model) => model.getObjectByName(MISSILE_FLAME));
    expect(flames).toHaveLength(3);
    expect(flames.every((flame) => flame && !flame.visible)).toBe(true);
  });

  it("lays the spilled can on its side, spout along the ground", () => {
    const slick = createOilSlickModel();
    slick.updateMatrixWorld(true);
    const can = slick.getObjectByName("item-oil-can")!;
    const box = new THREE.Box3().setFromObject(can);
    expect(box.max.y).toBeLessThan(0.45);
  });
});
