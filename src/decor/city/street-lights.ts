import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { celMaterial } from "../../rendering/cel-shading";
import { glowColor } from "../../rendering/glow";
import { createInstancedOutline } from "../../rendering/instanced-outline";

/** Pole with an arm: base on the ground (or the parapet) and arm pointing at the street. */
export interface StreetLamp {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Arm direction: the arm extends along local +z after this rotation. */
  readonly yaw: number;
  /** Pole height above the base. */
  readonly height: number;
  /** Light pool on the ground under the lamp; when omitted, only the real light illuminates. */
  readonly pool?: LightPool;
}

/** Light pool painted on the ground, tilted like the deck beneath it. */
export interface LightPool {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly yaw: number;
  readonly pitch: number;
}

export const LAMP_ARM = 2.1;
export const LAMP_COLOR = 0xffb062;
const POOL_TEXTURE_SIZE = 64;

/** Pole, arm and lamp head in a single drawing; the arm goes toward +z. */
function lampGeometry(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(0.08, 0.12, 1, 7);
  pole.translate(0, 0.5, 0);
  const plinth = new THREE.CylinderGeometry(0.2, 0.24, 0.5, 8);
  plinth.translate(0, 0.25, 0);
  const parts = [pole, plinth].map((part) => part.toNonIndexed());
  pole.dispose();
  plinth.dispose();
  return mergeGeometries(parts.map((part) => {
    part.deleteAttribute("uv");
    return part;
  }))!;
}

const headGeometry = (() => {
  const arm = new THREE.BoxGeometry(0.08, 0.08, LAMP_ARM);
  arm.translate(0, -0.06, LAMP_ARM / 2);
  const head = new THREE.BoxGeometry(0.44, 0.17, 0.82);
  head.translate(0, -0.12, LAMP_ARM);
  const merged = mergeGeometries([arm, head].map((part) => {
    part.deleteAttribute("uv");
    return part;
  }))!;
  arm.dispose();
  head.dispose();
  return merged;
})();

/** Soft radial gradient, white at the center: the color comes from the material. */
function poolTexture(): THREE.DataTexture {
  const size = POOL_TEXTURE_SIZE;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const value = Math.round(255 * Math.max(0, 1 - d) ** 1.6);
      data.set([value, value, value, 255], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material,
  matrices: readonly THREE.Matrix4[], name: string): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.count = matrices.length;
  mesh.name = name;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Position of the lens (light source) of a pole, in world coordinates. */
export function lampBulb(lamp: StreetLamp): THREE.Vector3 {
  return new THREE.Vector3(
    lamp.x + Math.sin(lamp.yaw) * LAMP_ARM,
    lamp.y + lamp.height - 0.25,
    lamp.z + Math.cos(lamp.yaw) * LAMP_ARM,
  );
}

/**
 * Instanced poles: dark structure with an outline, warm lens above the bloom
 * threshold and additive light pools on the ground, all in a few draw calls.
 */
export function createStreetLamps(lamps: readonly StreetLamp[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "street-lamps";
  const dummy = new THREE.Object3D();
  const poles: THREE.Matrix4[] = [];
  const heads: THREE.Matrix4[] = [];
  const lenses: THREE.Matrix4[] = [];
  const pools: THREE.Matrix4[] = [];
  for (const lamp of lamps) {
    dummy.position.set(lamp.x, lamp.y, lamp.z);
    dummy.rotation.set(0, lamp.yaw, 0);
    dummy.scale.set(1, lamp.height, 1);
    dummy.updateMatrix();
    poles.push(dummy.matrix.clone());
    dummy.position.y = lamp.y + lamp.height;
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    heads.push(dummy.matrix.clone());
    const bulb = lampBulb(lamp);
    dummy.position.set(bulb.x, bulb.y + 0.03, bulb.z);
    dummy.scale.set(0.34, 0.05, 0.64);
    dummy.updateMatrix();
    lenses.push(dummy.matrix.clone());
    if (lamp.pool) {
      dummy.position.set(lamp.pool.x, lamp.pool.y, lamp.pool.z);
      dummy.rotation.set(lamp.pool.pitch, lamp.pool.yaw, 0, "YXZ");
      dummy.scale.set(lamp.pool.radius * 2, 1, lamp.pool.radius * 2);
      dummy.updateMatrix();
      pools.push(dummy.matrix.clone());
      dummy.rotation.set(0, 0, 0, "XYZ");
    }
  }

  const metal = celMaterial(0x2c323c);
  const lens = new THREE.MeshBasicMaterial({ color: glowColor(LAMP_COLOR, 2.4) });
  lens.userData.outlineParameters = { visible: false };
  const pool = new THREE.MeshBasicMaterial({
    map: poolTexture(),
    color: new THREE.Color(LAMP_COLOR).multiplyScalar(0.42),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  pool.userData.outlineParameters = { visible: false };
  const poolPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  const poleMesh = instanced(lampGeometry(), metal, poles, "lamp-posts");
  const headMesh = instanced(headGeometry, metal, heads, "lamp-heads");
  poleMesh.castShadow = headMesh.castShadow = true;
  group.add(poleMesh, createInstancedOutline(poleMesh, 0.8), headMesh,
    createInstancedOutline(headMesh, 0.8),
    instanced(new THREE.BoxGeometry(1, 1, 1), lens, lenses, "lamp-lenses"));
  if (pools.length > 0) {
    const poolMesh = instanced(poolPlane, pool, pools, "lamp-light-pools");
    poolMesh.renderOrder = 2;
    group.add(poolMesh);
  }
  return group;
}

export interface LightRigOptions {
  /** How many real lights exist; the number never changes, to avoid recompiling shaders. */
  readonly count?: number;
  readonly color?: number;
  readonly intensity?: number;
  /** Range of each light and distance at which the light fades from view. */
  readonly range?: number;
}

/**
 * A few real point lights serve many poles: every frame they move to the
 * sources nearest the camera. Intensity drops to zero near the cutoff, so
 * switching poles neither lights nor extinguishes anything suddenly.
 */
export class LightRig {
  readonly group = new THREE.Group();
  readonly lights: THREE.PointLight[] = [];
  private readonly order: number[];
  private readonly distances: Float32Array;
  private readonly intensity: number;
  private readonly range: number;

  constructor(private readonly sources: readonly THREE.Vector3[], options: LightRigOptions = {}) {
    this.group.name = "street-light-rig";
    this.intensity = options.intensity ?? 42;
    this.range = options.range ?? 70;
    const count = options.count ?? 8;
    for (let index = 0; index < count; index++) {
      const light = new THREE.PointLight(options.color ?? LAMP_COLOR, 0, 24, 1.5);
      light.castShadow = false;
      this.lights.push(light);
      this.group.add(light);
    }
    this.order = sources.map((_, index) => index);
    this.distances = new Float32Array(sources.length);
  }

  /** Repositions the lights next to `view` (the camera). */
  update(view: THREE.Vector3): void {
    this.sources.forEach((source, index) => {
      this.distances[index] = source.distanceTo(view);
    });
    this.order.sort((a, b) => this.distances[a] - this.distances[b]);
    const count = this.lights.length;
    const cutoff = Math.min(this.range,
      this.order.length > count ? this.distances[this.order[count]] : Infinity);
    const fade = Math.max(4, cutoff * 0.3);
    this.lights.forEach((light, slot) => {
      const index = this.order[slot];
      if (index === undefined) {
        light.intensity = 0;
        return;
      }
      light.position.copy(this.sources[index]);
      const weight = THREE.MathUtils.clamp((cutoff - this.distances[index]) / fade, 0, 1);
      light.intensity = this.intensity * weight;
    });
  }
}
