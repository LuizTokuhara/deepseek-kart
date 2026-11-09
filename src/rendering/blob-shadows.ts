import * as THREE from "three/webgpu";
import {
  Fn,
  abs,
  dot,
  float,
  max,
  modelWorldMatrix,
  referenceAttribute,
  smoothstep,
  uniform,
  uv,
  vec4,
} from "three/tsl";

/** userData flag for static instanced scenery that gets distant blob shadows. */
export const BLOB_SHADOW_FLAG = "blobShadow";

/** Ground footprint of one static shadow caster, in world space. */
export interface ShadowFootprint {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  baseY: number;
  height: number;
}

/** Shorter casters (ground plants, pebbles) never read as floating. */
const MIN_HEIGHT = 1.2;
/** Anything wider is terrain-scale and handled by the real shadow map. */
const MAX_HALF_EXTENT = 7;
/** Caps horizontal shadow length per meter of height for very low suns. */
const MAX_SLOPE = 1.5;

/**
 * Reads every instance of flagged batches and merges the parts of one prop
 * (trunk + crown, stacked blocks) into a single footprint: a part joins a
 * footprint when its centre lies well inside the larger of the two.
 */
export function collectFootprints(root: THREE.Object3D): ShadowFootprint[] {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const instance = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const merged: ShadowFootprint[] = [];

  root.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh) || !object.userData[BLOB_SHADOW_FLAG]) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    for (let index = 0; index < object.count; index++) {
      object.getMatrixAt(index, instance);
      box.copy(object.geometry.boundingBox!).applyMatrix4(world.multiplyMatrices(object.matrixWorld, instance));
      const part = {
        x: (box.min.x + box.max.x) / 2,
        z: (box.min.z + box.max.z) / 2,
        halfX: (box.max.x - box.min.x) / 2,
        halfZ: (box.max.z - box.min.z) / 2,
        baseY: box.min.y,
        height: box.max.y - box.min.y,
      };
      const owner = merged.find((footprint) =>
        Math.hypot(footprint.x - part.x, footprint.z - part.z) <
          0.5 * Math.max(footprint.halfX, footprint.halfZ, part.halfX, part.halfZ) + 0.3);
      if (owner) unite(owner, part);
      else merged.push(part);
    }
  });

  return merged.filter((footprint) =>
    footprint.height >= MIN_HEIGHT &&
    Math.max(footprint.halfX, footprint.halfZ) <= MAX_HALF_EXTENT);
}

/** Grows `target` to the union of both world-aligned boxes. */
function unite(target: ShadowFootprint, part: ShadowFootprint): void {
  const minX = Math.min(target.x - target.halfX, part.x - part.halfX);
  const maxX = Math.max(target.x + target.halfX, part.x + part.halfX);
  const minZ = Math.min(target.z - target.halfZ, part.z - part.halfZ);
  const maxZ = Math.max(target.z + target.halfZ, part.z + part.halfZ);
  const top = Math.max(target.baseY + target.height, part.baseY + part.height);
  target.x = (minX + maxX) / 2;
  target.z = (minZ + maxZ) / 2;
  target.halfX = (maxX - minX) / 2;
  target.halfZ = (maxZ - minZ) / 2;
  target.baseY = Math.min(target.baseY, part.baseY);
  target.height = top - target.baseY;
}

export interface BlobShadowOptions {
  /** Direction from the scene towards the sun. */
  readonly sunDirection: THREE.Vector3;
  /** Light-space basis of the real shadow camera. */
  readonly shadowRight: THREE.Vector3;
  readonly shadowUp: THREE.Vector3;
  /** Half size of the real shadow camera frustum, in meters. */
  readonly shadowExtent: number;
  /** Peak darkness, matched to the course's real shadow intensity. */
  readonly opacity: number;
}

/**
 * Soft ground ellipses for static scenery beyond the real shadow map. Each one
 * stretches from the caster's base towards its shadow tip, and fades out where
 * the shadow map already draws the real shadow. One draw call for all.
 */
export class BlobShadows {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicNodeMaterial>;
  private readonly focus: THREE.UniformNode<"vec3">;

  constructor(footprints: readonly ShadowFootprint[], options: BlobShadowOptions) {
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometry.rotateX(-Math.PI / 2);

    const focus = uniform(new THREE.Vector3());
    const shadowRight = uniform(options.shadowRight.clone());
    const shadowUp = uniform(options.shadowUp.clone());
    const shadowFade = uniform(
      new THREE.Vector2(0.72, 0.97).multiplyScalar(options.shadowExtent),
    );
    const shadowColor = uniform(new THREE.Color(0x0c1024));
    const opacity = uniform(options.opacity);

    const instanceMatrix: any = referenceAttribute("instanceMatrix", "mat4");
    const blobUv = uv().mul(2).sub(1).toVarying("blobUv");
    const centre: any = (modelWorldMatrix as any)
      .mul(instanceMatrix.mul(vec4(0, 0, 0, 1)))
      .xyz
      .sub(focus);
    const coverage = max(
      abs(dot(centre, shadowRight)),
      abs(dot(centre, shadowUp)),
    );
    const fade = smoothstep(shadowFade.x, shadowFade.y, coverage)
      .toVarying("blobFade");
    const alpha = float(1)
      .sub(smoothstep(0.3, 1.0, blobUv.length()))
      .mul(opacity)
      .mul(fade);

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      fog: true,
    });
    material.name = "distant-blob-shadows";
    material.colorNode = shadowColor;
    material.opacityNode = alpha;
    material.maskNode = alpha.greaterThan(0.003);
    material.userData.outlineParameters = { visible: false };
    material.userData.focus = focus;

    this.focus = focus;
    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, footprints.length));
    this.mesh.name = "distant-blob-shadows";
    this.mesh.count = footprints.length;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;

    const away = new THREE.Vector2(-options.sunDirection.x, -options.sunDirection.z);
    const slope = Math.min(away.length() / Math.max(options.sunDirection.y, 1e-3), MAX_SLOPE);
    if (away.lengthSq() > 0) away.normalize();
    const yaw = Math.atan2(away.x, away.y);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    footprints.forEach((footprint, index) => {
      const radius = Math.max(footprint.halfX, footprint.halfZ);
      const reach = footprint.height * slope * 0.5;
      position.set(footprint.x + away.x * reach, footprint.baseY + 0.04, footprint.z + away.y * reach);
      scale.set(radius, 1, radius + reach);
      this.mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Tracks the real shadow camera's (texel-snapped) target. */
  follow(target: THREE.Vector3): void {
    this.focus.value.copy(target);
  }
}
