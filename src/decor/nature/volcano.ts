import * as THREE from "three";
import { celMaterial } from "../../rendering/cel-shading";
import { createBatch, flatMaterial } from "../common";
import type { Decoration } from "../types";

export interface VolcanoResult extends Decoration {
  smoke: THREE.InstancedMesh;
  update(dt: number): void;
}

export function createVolcano(
  centerX = 0,
  centerZ = 0,
): VolcanoResult {
  const group = new THREE.Group();
  group.name = "volcano";
  group.position.set(centerX, 0, centerZ);

  const radiusAt = (y: number, angle: number): number =>
    (32 - y / 46 * 27) *
    (1 + 0.08 * Math.sin(angle * 3) + 0.05 * Math.sin(angle * 7 + y * 0.1));
  const geometry = new THREE.CylinderGeometry(5, 32, 46, 18, 8, true);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index++) {
    const y = position.getY(index) + 23;
    const angle = Math.atan2(position.getZ(index), position.getX(index));
    const radius = radiusAt(y, angle);
    position.setXYZ(index, Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  }
  geometry.computeVertexNormals();
  const faceted = geometry.toNonIndexed();
  faceted.computeVertexNormals();
  geometry.dispose();
  const rockColors: number[] = [];
  const rockPosition = faceted.getAttribute("position");
  const rockColor = new THREE.Color();
  const palette = [0x81888b, 0x707b83, 0x91938a, 0x747a81];
  for (let face = 0; face < rockPosition.count; face += 3) {
    const angle = Math.atan2(
      rockPosition.getZ(face),
      rockPosition.getX(face),
    );
    const sector = Math.floor((angle + Math.PI) / (Math.PI * 2) * 18);
    rockColor.setHex(palette[sector % palette.length]);
    for (let vertex = 0; vertex < 3; vertex++) {
      rockColors.push(rockColor.r, rockColor.g, rockColor.b);
    }
  }
  faceted.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(rockColors, 3),
  );
  const rockMaterial = celMaterial(0xffffff);
  rockMaterial.vertexColors = true;
  group.add(new THREE.Mesh(faceted, rockMaterial));

  const crater = new THREE.Mesh(
    new THREE.CircleGeometry(5.1, 18),
    flatMaterial(0x492c29),
  );
  crater.rotation.x = -Math.PI / 2;
  crater.position.y = 45.8;
  group.add(crater);

  const lavaPool = new THREE.Mesh(
    new THREE.CircleGeometry(3.5, 18),
    flatMaterial(0xffa63b),
  );
  lavaPool.rotation.x = -Math.PI / 2;
  lavaPool.position.y = 45.83;
  group.add(lavaPool);

  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= 32; row++) {
    const y = 3 + row / 32 * 43;
    const angle = Math.PI + Math.sin(y * 0.17) * 0.045;
    const halfWidth = 1.2 + (1 - y / 46) * 1.3;
    for (const side of [-1, 1]) {
      const a = angle + side * halfWidth / radiusAt(y, angle);
      const radius = radiusAt(y, a) + 0.4;
      positions.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
    }
    if (row < 32) {
      const a = row * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const lavaGeometry = new THREE.BufferGeometry();
  lavaGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  lavaGeometry.setIndex(indices);
  lavaGeometry.computeVertexNormals();
  const lavaMaterial = flatMaterial(0xffa02e);
  lavaMaterial.side = THREE.DoubleSide;
  group.add(new THREE.Mesh(lavaGeometry, lavaMaterial));

  const smoke = createBatch(
    new THREE.IcosahedronGeometry(1, 1),
    celMaterial(0xb1a49f),
    Array.from({ length: 7 }, (_, index) => ({
      x: 0,
      y: 48 + index * 4,
      z: 0,
      scale: 2 + index * 0.5,
    })),
  );
  smoke.frustumCulled = false;
  group.add(smoke);

  const dummy = new THREE.Object3D();
  let elapsed = 0;
  return {
    group,
    smoke,
    colliders: [],
    update(dt) {
      elapsed += dt;
      for (let index = 0; index < smoke.count; index++) {
        const phase = (index / smoke.count + elapsed * 0.028) % 1;
        dummy.position.set(
          Math.sin(index * 2.1 + phase) * 2 + phase * 9,
          48 + phase * 26,
          phase * 5,
        );
        dummy.scale.setScalar(1.8 + phase * 3.3);
        dummy.rotation.set(0, phase, phase * 0.3);
        dummy.updateMatrix();
        smoke.setMatrixAt(index, dummy.matrix);
      }
      smoke.instanceMatrix.needsUpdate = true;
    },
  };
}
