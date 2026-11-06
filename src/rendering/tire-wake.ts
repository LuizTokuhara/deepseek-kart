import * as THREE from "three";
import { GROUND_Y } from "../core/config";
import type { Surface } from "../core/types";

const CAPACITY = 160;
interface Wisp {
  life: number; duration: number; x: number; y: number; z: number;
  yaw: number; pitch: number; roll: number; width: number; length: number;
}

/** Short, tapered brush marks anchored in the world behind each rear tire. */
export class TireWake {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly wisps: Wisp[] = [];
  private readonly opacity = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private cursor = 0;

  constructor() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    // Origin touches the tire; the tail lifts gently above the road.
    geometry.translate(0, 0.5, 0);
    geometry.rotateX(-Math.PI / 2 + 0.13);
    geometry.setAttribute("wispOpacity", this.opacity);
    this.opacity.setUsage(THREE.DynamicDrawUsage);
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      vertexShader: `
        #include <common>
        #include <fog_pars_vertex>
        attribute float wispOpacity;
        varying vec2 brushUv;
        varying vec3 tint;
        varying float alpha;
        void main() {
          brushUv = uv;
          alpha = wispOpacity;
          tint = instanceColor;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        varying vec2 brushUv;
        varying vec3 tint;
        varying float alpha;
        void main() {
          float tail = brushUv.y;
          float tooth = sin(tail * 47.0 + brushUv.x * 23.0) * 0.045;
          float edge = abs(brushUv.x - 0.5) * 2.0;
          float taper = 0.92 - tail * 0.68 + tooth;
          float silhouette = 1.0 - smoothstep(taper - 0.12, taper, edge);
          float bristles = 0.65 + 0.35 * pow(abs(sin(brushUv.x * 37.0 + tail * 3.0)), 3.0);
          float fade = (1.0 - smoothstep(0.25, 1.0, tail)) * smoothstep(0.0, 0.08, tail);
          float a = silhouette * bristles * fade * alpha;
          if (a < 0.015) discard;
          gl_FragColor = vec4(tint * (0.82 + 0.18 * bristles), a);
          #include <fog_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    material.userData.outlineParameters = { visible: false };
    this.mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    this.mesh.name = "painted-tire-wake";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < CAPACITY; i++) {
      this.wisps.push({ life: 0, duration: 1, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, width: 0, length: 0 });
      this.mesh.setColorAt(i, this.color);
    }
    this.reset();
  }

  emit(x: number, height: number, z: number, yaw: number, surface: Surface, speed: number, boost: boolean, pitch = 0, roll = 0): void {
    const index = this.cursor++ % CAPACITY;
    const wisp = this.wisps[index];
    wisp.life = wisp.duration = boost ? 0.24 : 0.36;
    wisp.x = x; wisp.y = GROUND_Y + height + 0.075; wisp.z = z;
    wisp.yaw = yaw + (Math.random() - 0.5) * 0.12;
    wisp.pitch = pitch; wisp.roll = roll;
    wisp.width = (boost ? 0.42 : 0.55) + Math.random() * 0.22;
    wisp.length = (boost ? 1.5 : 0.8) + Math.min(30, Math.abs(speed)) * 0.045;
    this.color.setHex(surface === "dirt" ? 0xf5e6cb : surface === "grass" ? 0xcbd4ae : surface === "ice" ? 0xdaf5ff : 0xf4f6ff);
    this.mesh.setColorAt(index, this.color);
    this.mesh.instanceColor!.needsUpdate = true;
    this.write(index);
    this.flush();
  }

  update(dt: number): void {
    const step = Math.max(0, Math.min(dt, 0.05));
    for (let i = 0; i < CAPACITY; i++) {
      if (this.wisps[i].life <= 0) continue;
      this.wisps[i].life = Math.max(0, this.wisps[i].life - step);
      this.write(i);
    }
    this.flush();
  }

  reset(): void {
    this.cursor = 0;
    for (let i = 0; i < CAPACITY; i++) { this.wisps[i].life = 0; this.write(i); }
    this.flush();
  }

  private write(index: number): void {
    const w = this.wisps[index];
    const age = 1 - w.life / w.duration;
    this.dummy.position.set(w.x, w.y + age * 0.14, w.z);
    this.dummy.rotation.order = "YXZ";
    this.dummy.rotation.set(w.pitch, w.yaw, w.roll);
    this.dummy.scale.set(w.width * (1 + age * 0.6), 1, w.length * (1 + age * 0.35));
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(index, this.dummy.matrix);
    this.opacity.setX(index, (1 - age) ** 1.5 * 0.68);
  }

  private flush(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.opacity.needsUpdate = true;
  }
}
