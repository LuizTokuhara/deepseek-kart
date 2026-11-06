import * as THREE from "three";
import { clamp, damp } from "../core/math";
import type { KartState } from "../core/types";

/** Screen-space ink strokes: one draw call, with an unobstructed central ellipse. */
export class SpeedLines {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private strength = 0;
  private kick = 0;
  private wasBoosting = false;

  constructor() {
    const positions: number[] = [];
    const strokes: number[] = [];
    for (let i = 0; i < 88; i++) {
      // Stable, irregular spacing avoids both a spinning wheel and random flicker.
      const angle = i * 2.399963;
      const phase = (i * 0.618034) % 1;
      for (const [along, side] of [[0, 0], [1, -1], [1, 1]]) {
        positions.push(along, side, 0);
        strokes.push(angle, phase, 0.55 + ((i * 0.414214) % 1) * 0.45);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("stroke", new THREE.Float32BufferAttribute(strokes, 3));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        elapsed: { value: 0 }, strength: { value: 0 }, kick: { value: 0 },
        steer: { value: 0 }, aspect: { value: 1 },
      },
      vertexShader: `
        attribute vec3 stroke;
        uniform float elapsed, strength, kick, steer, aspect;
        varying float alpha;
        varying vec2 strokeUv;
        void main() {
          float phase = fract(stroke.y + elapsed * (0.65 + stroke.z * 0.5));
          vec2 direction = vec2(cos(stroke.x), sin(stroke.x));
          vec2 normal = vec2(-direction.y, direction.x);
          // Long tapered tips reach toward the vanishing point, like drawn
          // acceleration strokes, while the outer ends run beyond the frame.
          float radius = 0.27 + phase * 0.72;
          float reach = (0.65 + strength * 0.85 + kick * 0.22) * stroke.z;
          float width = (0.005 + strength * 0.013) * stroke.z * stroke.z;
          vec2 p = direction * (radius + position.x * reach);
          p += normal * position.y * width * vec2(clamp(1.0 / aspect, 0.7, 1.6), 1.0);
          p += vec2(-steer * 0.09, 0.13);
          gl_Position = vec4(p, 0.0, 1.0);
          strokeUv = position.xy;
          float envelope = smoothstep(0.0, 0.12, phase) * (1.0 - smoothstep(0.72, 1.0, phase));
          // Keep the strongest streaks beside and above the car, with a lighter
          // wake across the foreground instead of a solid radial burst.
          float foreground = direction.y < 0.0 ? mix(0.22, 1.0, smoothstep(0.2, 0.65, abs(direction.x))) : 1.0;
          alpha = (0.15 + position.x * 0.85) * envelope * strength * (0.35 + stroke.z * 0.4) * foreground;
        }
      `,
      fragmentShader: `
        varying float alpha;
        varying vec2 strokeUv;
        void main() {
          // Feather the edges of each tapered triangle, retaining a narrow core.
          float edge = abs(strokeUv.y) / max(strokeUv.x, 0.001);
          float feather = 1.0 - smoothstep(0.12, 1.0, edge);
          float tip = smoothstep(0.0, 0.18, strokeUv.x);
          gl_FragColor = vec4(0.88, 0.94, 1.0, min(alpha, 0.42) * feather * tip);
          #include <colorspace_fragment>
        }
      `,
      transparent: true, depthTest: false, depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.userData.outlineParameters = { visible: false };
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "comic-speed-lines";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
  }

  update(dt: number, state: Pick<KartState, "falling" | "spinTimer" | "miniTurboTimer" | "miniTurboTier" | "vForward" | "drifting" | "driftCharge" | "steer">, aspect: number, enabled: boolean): void {
    if (!enabled || state.falling || state.spinTimer > 0) {
      this.reset();
      return;
    }
    const step = clamp(dt, 0, 0.05);
    const boosting = state.miniTurboTimer > 0;
    const speed = clamp((Math.abs(state.vForward) - 5) / 15, 0, 1);
    if (boosting && !this.wasBoosting) this.kick = 1;
    this.wasBoosting = boosting;
    this.kick = Math.max(0, this.kick - step * 3.5);
    const target = speed * (boosting ? 0.8 + state.miniTurboTier * 0.06 : state.drifting ? 0.24 + state.driftCharge * 0.2 : 0);
    this.strength = damp(this.strength, target, target > this.strength ? 13 : 8, step);
    const uniforms = this.mesh.material.uniforms;
    uniforms.elapsed.value += step;
    uniforms.strength.value = this.strength;
    uniforms.kick.value = this.kick;
    uniforms.steer.value = damp(uniforms.steer.value, state.steer, 6, step);
    uniforms.aspect.value = aspect;
    this.mesh.visible = this.strength > 0.005;
  }

  reset(): void {
    this.strength = this.kick = 0;
    this.wasBoosting = false;
    this.mesh.visible = false;
    for (const name of ["elapsed", "strength", "kick", "steer"]) this.mesh.material.uniforms[name].value = 0;
  }
}
