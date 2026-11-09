import * as THREE from "three/webgpu";
import {
  Fn, attribute, cameraWorldMatrix, cos, float, mod, positionGeometry,
  sin, smoothstep, uniform, uv, vec3, vec4,
} from "three/tsl";

export interface SnowfallOptions {
  readonly count: number;
  readonly radius: number;
}

const CYCLE_HEIGHT = 18;

/**
 * Camera-facing instanced flakes. WebGPU point primitives cannot carry a size,
 * so the old `Points` + `gl_PointSize` draw becomes a small quad batch.
 */
export class Snowfall {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicNodeMaterial>;
  private readonly count: number;
  private readonly radius: number;
  private readonly anchor = uniform(new THREE.Vector3());
  private readonly elapsed = uniform(0);

  constructor(options: SnowfallOptions) {
    this.count = Math.max(0, Math.min(1200, Math.floor(options.count)));
    this.radius = Math.max(8, options.radius);
    const count = this.count;
    const origins = new Float32Array(Math.max(1, count) * 3);
    const sizes = new Float32Array(Math.max(1, count));
    const phases = new Float32Array(Math.max(1, count));
    let seed = 93621;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      origins[i * 3] = (random() - 0.5) * this.radius * 2;
      origins[i * 3 + 1] = random() * CYCLE_HEIGHT;
      origins[i * 3 + 2] = (random() - 0.5) * this.radius * 2;
      sizes[i] = 0.035 + random() * 0.045;
      phases[i] = random() * Math.PI * 2;
    }

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    material.name = "winter-snowfall";
    const radius = uv().sub(0.5).length().mul(2);
    const alpha = float(1).sub(smoothstep(0.4, 1.0, radius)).mul(0.9);
    material.colorNode = vec3(0.91, 0.96, 1.0);
    material.opacityNode = alpha;
    material.maskNode = alpha.greaterThan(0.01);
    material.userData.outlineParameters = { visible: false };

    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute("snowOrigin", new THREE.InstancedBufferAttribute(origins, 3));
    geometry.setAttribute("snowSize", new THREE.InstancedBufferAttribute(sizes, 1));
    geometry.setAttribute("snowPhase", new THREE.InstancedBufferAttribute(phases, 1));
    material.positionNode = Fn(() => {
      const origin = attribute("snowOrigin", "vec3");
      const size = attribute("snowSize", "float");
      const phase = attribute("snowPhase", "float");
      const t = this.elapsed;
      const anchor = this.anchor;
      const diameter = this.radius * 2;
      const driftX = origin.x.add(t.mul(0.85)).add(sin(t.mul(0.35).add(phase)).mul(0.8));
      const driftZ = origin.z.add(t.mul(0.3)).add(cos(t.mul(0.28).add(phase)).mul(0.45));
      // TSL mod uses floor semantics, so wrapping stays positive on both backends.
      const x = mod(driftX.sub(anchor.x).add(this.radius), diameter).sub(this.radius).add(anchor.x);
      const z = mod(driftZ.sub(anchor.z).add(this.radius), diameter).sub(this.radius).add(anchor.z);
      const fall = origin.y.sub(t.mul(size.mul(8).add(0.85))).sub(anchor.y).add(4);
      const y = mod(fall, CYCLE_HEIGHT).add(anchor.y).sub(4);
      const corner = cameraWorldMatrix.mul(vec4(positionGeometry.xy.mul(size.mul(2.6)), 0, 0)).xyz;
      return vec3(x, y, z).add(corner);
    })();

    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
    this.mesh.name = "winter-snowfall";
    this.mesh.count = count;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    // Identity instance matrices and per-flake attributes remain static on the GPU.
  }

  update(dt: number, cameraPosition: THREE.Vector3, _viewportHeight: number, reducedMotion = false): void {
    this.mesh.visible = !reducedMotion;
    this.anchor.value.copy(cameraPosition);
    if (!reducedMotion) this.elapsed.value += Math.max(0, Math.min(dt, 0.05));
  }
}
