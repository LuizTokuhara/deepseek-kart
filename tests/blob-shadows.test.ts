import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  BLOB_SHADOW_FLAG,
  BlobShadows,
  collectFootprints,
  type ShadowFootprint,
} from "../src/rendering/blob-shadows";
import { createBatch } from "../src/decor/common";

const material = new THREE.MeshBasicMaterial();
/** Trunk 0.4 m wide and 4 m tall, standing on the ground. */
const trunk = new THREE.BoxGeometry(0.4, 4, 0.4).translate(0, 2, 0);
/** Crown 3 m wide sitting on top of the trunk. */
const crown = new THREE.BoxGeometry(3, 2, 3).translate(0, 4.5, 0);

function grove(spots: { x: number; z: number }[], shadows = true): THREE.Group {
  const group = new THREE.Group();
  const placements = spots.map((spot) => ({ ...spot, y: 0 }));
  group.add(createBatch(trunk, material, placements, shadows));
  group.add(createBatch(crown, material, placements, shadows));
  return group;
}

const options = {
  sunDirection: new THREE.Vector3(-1, 1, 0).normalize(),
  shadowRight: new THREE.Vector3(1, 0, 0),
  shadowUp: new THREE.Vector3(0, 0, 1),
  shadowExtent: 28,
  opacity: 0.4,
};

describe("collectFootprints", () => {
  it("should merge a tree's trunk and crown into one footprint from ground to top", () => {
    const footprints = collectFootprints(grove([{ x: 10, z: -5 }]));

    expect(footprints).toHaveLength(1);
    expect(footprints[0].x).toBeCloseTo(10);
    expect(footprints[0].z).toBeCloseTo(-5);
    expect(footprints[0].baseY).toBeCloseTo(0);
    expect(footprints[0].height).toBeCloseTo(5.5);
    expect(footprints[0].halfX).toBeCloseTo(1.5);
  });

  it("should keep neighbouring trees as separate footprints", () => {
    const footprints = collectFootprints(grove([{ x: 0, z: 0 }, { x: 4, z: 0 }]));

    expect(footprints).toHaveLength(2);
  });

  it("should ignore batches that do not cast shadows", () => {
    expect(collectFootprints(grove([{ x: 0, z: 0 }], false))).toHaveLength(0);
  });

  it("should drop short ground cover and terrain-scale casters", () => {
    const group = new THREE.Group();
    const plants = createBatch(new THREE.BoxGeometry(1, 0.6, 1), material, [{ x: 0, y: 0, z: 0 }], true);
    const mesa = createBatch(new THREE.BoxGeometry(20, 6, 20), material, [{ x: 40, y: 3, z: 0 }], true);
    group.add(plants, mesa);

    expect(collectFootprints(group)).toHaveLength(0);
  });

  it("should flag static batches only when they cast shadows", () => {
    const lit = createBatch(trunk, material, [], true);
    const unlit = createBatch(trunk, material, [], false);

    expect(lit.userData[BLOB_SHADOW_FLAG]).toBe(true);
    expect(unlit.userData[BLOB_SHADOW_FLAG]).toBe(false);
  });
});

describe("BlobShadows", () => {
  const footprint: ShadowFootprint = { x: 0, z: 0, halfX: 1, halfZ: 1, baseY: 0, height: 4 };

  it("should place one ellipse per footprint, shifted away from the sun", () => {
    const blobs = new BlobShadows([footprint, { ...footprint, x: 20 }], options);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();

    blobs.mesh.getMatrixAt(0, matrix);
    position.setFromMatrixPosition(matrix);

    expect(blobs.mesh.count).toBe(2);
    // Sun in -X: the shadow falls towards +X by half the 45° shadow length.
    expect(position.x).toBeCloseTo(2);
    expect(position.z).toBeCloseTo(0);
  });

  it("should stretch the ellipse along the shadow direction", () => {
    const blobs = new BlobShadows([footprint], options);
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();

    blobs.mesh.getMatrixAt(0, matrix);
    matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);

    expect(scale.x).toBeCloseTo(1);
    expect(scale.z).toBeCloseTo(3);
  });

  it("should cap the shadow length for very low suns", () => {
    const blobs = new BlobShadows([footprint], {
      ...options,
      sunDirection: new THREE.Vector3(-1, 0.05, 0).normalize(),
    });
    const matrix = new THREE.Matrix4();

    blobs.mesh.getMatrixAt(0, matrix);

    // Height 4 m × capped slope 1.5, centred halfway along the shadow.
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(3);
  });

  it("should follow the real shadow camera target", () => {
    const blobs = new BlobShadows([footprint], options);

    blobs.follow(new THREE.Vector3(5, 0, -3));

    expect(blobs.mesh.material.uniforms.shadowFocus.value.toArray()).toEqual([5, 0, -3]);
  });
});
