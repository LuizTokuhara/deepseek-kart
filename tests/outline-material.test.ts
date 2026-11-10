import * as THREE from "three/webgpu";
import { describe, expect, it, vi } from "vitest";
import { celMaterial, kartCelMaterial, outlinedMaterial } from "../src/rendering/cel-shading";
import { createOutlineObject, outlineStyle, releaseOutlineObject } from "../src/rendering/outline-material";
import { OutlineManager } from "../src/rendering/outline-manager";

describe("TSL ink outlines", () => {
  it("keeps material groups aligned when only some groups have an outline", () => {
    const geometry = new THREE.BoxGeometry();
    const materials = [outlinedMaterial(0xffffff), celMaterial(0xffffff)];
    const source = new THREE.Mesh(geometry, materials);
    const hull = createOutlineObject(source)!;
    const ink = hull.material as THREE.Material[];
    expect(hull.geometry).toBe(geometry);
    expect(ink).toHaveLength(2);
    expect(ink[0].visible).toBe(true);
    expect(ink[1].visible).toBe(false);
    releaseOutlineObject(hull);
  });

  it("attaches late nested meshes, releases removals and supports reattachment", () => {
    const scene = new THREE.Scene();
    const manager = new OutlineManager(scene);
    const group = new THREE.Group();
    scene.add(group);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), outlinedMaterial(0xffffff));
    group.add(mesh);
    const first = mesh.userData.outlineObject as THREE.Mesh;
    expect(first?.parent).toBe(mesh);
    expect(first.children).toHaveLength(0);
    const disposed = vi.fn();
    (first.material as THREE.Material).addEventListener("dispose", disposed);
    group.remove(mesh);
    expect(disposed).toHaveBeenCalledOnce();
    expect(mesh.children).toHaveLength(0);
    group.add(mesh);
    expect(mesh.children).toHaveLength(1);
    expect(mesh.userData.outlineObject).not.toBe(first);
    manager.dispose();
    expect(mesh.children).toHaveLength(0);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), outlinedMaterial(0xffffff)));
    expect(group.children[1].children).toHaveLength(0);
  });

  it("retains shared materials until the last hull is removed", () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(), outlinedMaterial(0xffffff));
    const a = createOutlineObject(source)!;
    const b = createOutlineObject(source)!;
    const disposed = vi.fn();
    expect(a.material).toBe(b.material);
    (a.material as THREE.Material).addEventListener("dispose", disposed);
    releaseOutlineObject(a);
    expect(disposed).not.toHaveBeenCalled();
    releaseOutlineObject(b);
    expect(disposed).toHaveBeenCalledOnce();
  });

  it("honors keepAlive until the source material is disposed", () => {
    const material = outlinedMaterial(0xffffff);
    material.userData.outlineParameters.keepAlive = true;
    const source = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const first = createOutlineObject(source)!;
    const disposed = vi.fn();
    (first.material as THREE.Material).addEventListener("dispose", disposed);
    releaseOutlineObject(first);
    const next = createOutlineObject(source)!;
    expect(next.material).toBe(first.material);
    releaseOutlineObject(next);
    expect(disposed).not.toHaveBeenCalled();
    material.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });

  it("should build a back-face hull only for outlined materials", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const plain = new THREE.Mesh(geometry, celMaterial(0xffffff));
    const inked = new THREE.Mesh(geometry, outlinedMaterial(0xffffff));

    expect(createOutlineObject(plain)).toBeNull();

    const hull = createOutlineObject(inked) as THREE.Mesh;
    expect(hull).toBeTruthy();
    expect(hull.userData.isOutline).toBe(true);
    expect(hull.geometry).toBe(geometry);
    expect((hull.material as THREE.Material).userData.isOutline).toBe(true);
  });

  it("should share instance matrices and keep the instance count in sync", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = outlinedMaterial(0xffffff);
    const source = new THREE.InstancedMesh(geometry, material, 3);
    source.frustumCulled = false;

    const hull = createOutlineObject(source) as THREE.InstancedMesh;

    expect(hull).toBeTruthy();
    expect(hull.instanceMatrix).toBe(source.instanceMatrix);
    expect(hull.count).toBe(3);
    source.count = 1;
    hull.onBeforeRender(null as never, null as never, null as never, null as never, null as never, null as never);
    expect(hull.count).toBe(1);
  });

  it("keeps a pixel floor for kart ink without enabling plain materials or widening scenery", () => {
    const kart = kartCelMaterial(0xffffff, 0.0035);
    const plainKart = kartCelMaterial(0xffffff);
    const scenery = outlinedMaterial(0xffffff);
    expect(outlineStyle(kart)?.minimumPixels).toBe(1.5);
    expect(outlineStyle(kart)?.clipThickness).toBe(0.0035);
    expect(outlineStyle(plainKart)).toBeNull();
    expect(outlineStyle(scenery)?.minimumPixels).toBeUndefined();
    kart.dispose(); plainKart.dispose(); scenery.dispose();
  });

  it("draws kart ink after the paint and rejects the visible paint mask", () => {
    const material = kartCelMaterial(0xffffff, 0.0035);
    const source = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const hull = createOutlineObject(source)!;
    const ink = hull.material as THREE.MeshBasicNodeMaterial;
    expect(material.stencilWrite).toBe(true);
    expect(material.stencilZPass).toBe(THREE.ReplaceStencilOp);
    expect(ink.side).toBe(THREE.DoubleSide);
    expect(ink.stencilFunc).toBe(THREE.NotEqualStencilFunc);
    expect(ink.stencilRef).toBe(material.stencilRef);
    expect(ink.stencilWriteMask).toBe(0);
    expect(hull.renderOrder).toBeGreaterThan(source.renderOrder);
    releaseOutlineObject(hull);
    source.geometry.dispose(); material.dispose();
  });

  it("should express instanced strokes in pixels and others in clip space", () => {
    const material = outlinedMaterial(0xffffff, 0.002);
    const regular = outlineStyle(material);
    const instanced = outlineStyle(material, 1.15);

    expect(regular?.clipThickness).toBeCloseTo(0.002);
    expect(regular?.pixels).toBeUndefined();
    expect(instanced?.pixels).toBe(1.15);
    expect(instanced?.clipThickness).toBeUndefined();
  });
});
