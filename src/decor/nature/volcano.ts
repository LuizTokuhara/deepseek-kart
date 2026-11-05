import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { celMaterial, outlinedMaterial } from "../../rendering/cel-shading";
import { createBatch, flatMaterial } from "../common";
import type { Decoration } from "../types";

export interface VolcanoResult extends Decoration {
  smoke: THREE.InstancedMesh;
  update(dt: number): void;
}

/** Sculpted basalt landmark. All geometry and animation are local to the prop. */
export function createVolcano(centerX = 0, centerZ = 0): VolcanoResult {
  const group = new THREE.Group();
  group.name = "volcano";
  group.position.set(centerX, 0, centerZ);
  const profile = [34, 32, 27, 23, 20, 17.5, 14, 10.5, 8.8];
  const height = 44;
  const radiusAt = (y: number, angle: number): number => {
    const row = THREE.MathUtils.clamp(y / height * 8, 0, 7.999);
    const i = Math.floor(row);
    const base = THREE.MathUtils.lerp(profile[i], profile[i + 1], row - i);
    return base * (1 + 0.1 * Math.sin(angle * 5 + y * 0.035) +
      0.045 * Math.cos(angle * 9 - y * 0.06));
  };
  const rimHeight = (a: number): number => height + Math.sin(a * 3) * 1.4 + Math.cos(a * 5) * 0.65;
  const sectors = 40;
  const positions: number[] = [], indices: number[] = [];
  for (let row = 0; row <= 8; row++) {
    for (let i = 0; i <= sectors; i++) {
      const a = i / sectors * Math.PI * 2;
      const y = row / 8 * height + (row / 8) ** 3 * (rimHeight(a) - height);
      const r = radiusAt(row / 8 * height, a);
      positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
      if (row < 8 && i < sectors) {
        const b = row * (sectors + 1) + i;
        indices.push(b, b + sectors + 1, b + 1, b + 1, b + sectors + 1, b + sectors + 2);
      }
    }
  }
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  indexed.setIndex(indices);
  const rock = indexed.toNonIndexed(); indexed.dispose();
  rock.computeVertexNormals();
  const color = new THREE.Color(), colors: number[] = [];
  const points = rock.getAttribute("position");
  const palette = [0x646c70, 0x798080, 0x88908b, 0x5b656b];
  for (let face = 0; face < points.count; face += 3) {
    const y = (points.getY(face) + points.getY(face + 1) + points.getY(face + 2)) / 3;
    const angle = Math.atan2(points.getZ(face), points.getX(face));
    const sector = Math.floor((angle + Math.PI) / (Math.PI * 2) * sectors);
    color.setHex(palette[(sector + Math.floor(y / 11)) % palette.length]);
    if (y < 10) color.lerp(new THREE.Color(0x668063), 0.6);
    if (y > 37) color.lerp(new THREE.Color(0x403c42), 0.5);
    for (let v = 0; v < 3; v++) colors.push(color.r, color.g, color.b);
  }
  rock.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = outlinedMaterial(0xffffff, 0.0008);
  material.vertexColors = true;
  group.add(new THREE.Mesh(rock, material));
  // Project the flows onto the actual faceted mesh, not an idealized cone.
  const surface = new THREE.Mesh(rock, material);
  const ray = new THREE.Raycaster();
  const rayOrigin = new THREE.Vector3(), rayDirection = new THREE.Vector3();
  const surfaceRadius = (y: number, a: number): number => {
    rayOrigin.set(Math.cos(a) * 60, y, Math.sin(a) * 60);
    rayDirection.set(-Math.cos(a), 0, -Math.sin(a));
    ray.set(rayOrigin, rayDirection);
    const hit = ray.intersectObject(surface, false)[0];
    return hit ? Math.hypot(hit.point.x, hit.point.z) : radiusAt(y, a);
  };

  // A real recessed bowl replaces the flat disk on top of the old cone.
  const bowlPositions: number[] = [], bowlIndices: number[] = [];
  for (let i = 0; i <= sectors; i++) {
    const a = i / sectors * Math.PI * 2;
    bowlPositions.push(Math.cos(a) * radiusAt(height, a), rimHeight(a), Math.sin(a) * radiusAt(height, a),
      Math.cos(a) * 4.8, 38.5, Math.sin(a) * 4.8);
    if (i < sectors) { const b = i * 2; bowlIndices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  const bowl = new THREE.BufferGeometry();
  bowl.setAttribute("position", new THREE.Float32BufferAttribute(bowlPositions, 3));
  bowl.setIndex(bowlIndices); bowl.computeVertexNormals();
  const bowlMaterial = celMaterial(0x49383c); bowlMaterial.side = THREE.DoubleSide;
  group.add(new THREE.Mesh(bowl, bowlMaterial));
  const lava = flatMaterial(0xff6b27), hot = flatMaterial(0xffce68);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(4.9, 32), lava);
  pool.rotation.x = -Math.PI / 2; pool.position.y = 38.6; group.add(pool);

  const ribbon = (branch: number, widthScale: number, lift: number): THREE.BufferGeometry => {
    const p: number[] = [], ix: number[] = [];
    const top = branch === 0 ? 42.5 : 29;
    for (let row = 0; row <= 48; row++) {
      const y = 1.8 + row / 48 * (top - 1.8);
      const pathAngle = Math.PI + Math.sin(y * 0.17) * 0.12 +
        branch * Math.max(0, (29 - y) / 29) * 0.6;
      const width = (0.65 + (1 - y / height) * 1.2 + Math.sin(y * 0.6) * 0.18) * widthScale;
      for (const side of [-1, 1]) {
        const a = pathAngle + side * width / radiusAt(y, pathAngle);
        const r = surfaceRadius(y, a) + lift;
        p.push(Math.cos(a) * r, y, Math.sin(a) * r);
      }
      if (row < 48) { const b = row * 2; ix.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(ix); g.computeVertexNormals(); return g;
  };
  const crust = celMaterial(0x552d2b); crust.side = lava.side = hot.side = THREE.DoubleSide;
  let flowLayer = 1;
  for (const [mat, width, lift] of [[crust, 1.65, 0.35], [lava, 1, 0.46], [hot, 0.22, 0.55]] as const) {
    const parts = [0, -1, 1].map(branch => ribbon(branch, width, lift));
    // Decal layers test against the rock, not against the wider adjacent flow.
    mat.depthWrite = false;
    const flow = new THREE.Mesh(mergeGeometries(parts)!, mat);
    flow.renderOrder = flowLayer++;
    group.add(flow); parts.forEach(g => g.dispose());
  }

  const smokeShape = [0, 1, 2].map(i => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(1, 0.8, 0.9); g.translate(Math.cos(i * 2.1) * 0.6, i * 0.25, Math.sin(i * 2.1) * 0.6);
    return g;
  });
  const smokeGeometry = mergeGeometries(smokeShape)!; smokeShape.forEach(g => g.dispose());
  const smoke = createBatch(smokeGeometry, celMaterial(0xffffff),
    Array.from({ length: 12 }, () => ({ x: 0, y: 46, z: 0, scale: 0 })));
  smoke.frustumCulled = false; group.add(smoke);
  const dummy = new THREE.Object3D();
  const smokeColor = new THREE.Color(), warmSmoke = new THREE.Color(0x9e969c), paleSmoke = new THREE.Color(0xd4d9d5);
  let elapsed = 0;
  const update = (dt: number): void => {
    elapsed += dt;
    hot.color.setHSL(0.105 + Math.sin(elapsed * 0.9) * 0.012, 1, 0.69);
    for (let i = 0; i < smoke.count; i++) {
      const phase = (i / smoke.count + elapsed * 0.025) % 1;
      dummy.position.set(phase * 11 + Math.sin(i * 2.1 + phase * 3) * 1.3,
        43 + phase * 31, phase * 5 + Math.cos(i * 1.7) * 0.9);
      dummy.scale.setScalar(Math.sin(phase * Math.PI) * (2.2 + phase * 3.5));
      dummy.rotation.set(0, i + phase, Math.sin(phase * 2) * 0.2);
      dummy.updateMatrix(); smoke.setMatrixAt(i, dummy.matrix);
      smoke.setColorAt(i, smokeColor.copy(warmSmoke).lerp(paleSmoke, phase));
    }
    smoke.instanceMatrix.needsUpdate = true;
    if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true;
  };
  update(0);
  return { group, smoke, colliders: [], update };
}
