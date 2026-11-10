import * as THREE from "three/webgpu";
import {
  Fn,
  attribute,
  clamp,
  cos,
  float,
  fract,
  max,
  min,
  positionGeometry,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec4,
} from "three/tsl";
import { clamp as clampValue, damp } from "../core/math";
import type { KartState } from "../core/types";

/** Screen-space ink strokes: one draw call, with an unobstructed central ellipse. */
export class SpeedLines {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.NodeMaterial>;
  private readonly elapsed = uniform(0);
  private readonly strengthUniform = uniform(0);
  private readonly kickUniform = uniform(0);
  private readonly steerUniform = uniform(0);
  private readonly aspectUniform = uniform(1);
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

    const stroke = attribute("stroke", "vec3");
    const phase = fract(
      stroke.y.add(this.elapsed.mul(float(0.65).add(stroke.z.mul(0.5)))),
    );
    const direction = vec2(cos(stroke.x), sin(stroke.x));
    const normal = vec2(direction.y.negate(), direction.x);

    // Long tapered tips reach toward the vanishing point, like drawn
    // acceleration strokes, while the outer ends run beyond the frame.
    const radius = float(0.27).add(phase.mul(0.72));
    const reach = float(0.65)
      .add(this.strengthUniform.mul(0.85))
      .add(this.kickUniform.mul(0.22))
      .mul(stroke.z);
    const width = float(0.005)
      .add(this.strengthUniform.mul(0.013))
      .mul(stroke.z)
      .mul(stroke.z);
    const aspectScale = clamp(
      float(1).div(this.aspectUniform),
      float(0.7),
      float(1.6),
    );
    const p = direction.mul(radius.add(positionGeometry.x.mul(reach)))
      .add(normal.mul(positionGeometry.y).mul(width).mul(vec2(aspectScale, 1)))
      .add(vec2(this.steerUniform.negate().mul(0.09), 0.13));

    const strokeUv = positionGeometry.xy.toVarying("strokeUv");
    const envelope = smoothstep(0, 0.12, phase)
      .mul(float(1).sub(smoothstep(0.72, 1, phase)));
    // Keep the strongest streaks beside and above the car, with a lighter
    // wake across the foreground instead of a solid radial burst.
    const foreground = direction.y.lessThan(0)
      .select(
        float(0.22).add(
          smoothstep(0.2, 0.65, positionGeometry.x.abs()).mul(0.78),
        ),
        float(1),
      );
    const alpha = positionGeometry.x.mul(0.85).add(0.15)
      .mul(envelope)
      .mul(this.strengthUniform)
      .mul(float(0.35).add(stroke.z.mul(0.4)))
      .mul(foreground)
      .toVarying("strokeAlpha");

    // Color and opacity nodes, not a fragmentNode: only the standard output
    // fills every scene pass target, and a missing target drops the pipeline.
    const material = new THREE.MeshBasicNodeMaterial({ fog: false });
    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
    material.name = "comic-speed-lines";
    material.vertexNode = Fn(() => vec4(p, 0.0, 1.0))();
    material.colorNode = vec4(0.88, 0.94, 1.0, 1.0);
    material.opacityNode = Fn(() => {
      // Feather the edges of each tapered triangle, retaining a narrow core.
      const edgeValue = strokeUv.y.abs().div(max(strokeUv.x, 0.001));
      const feather = float(1).sub(smoothstep(0.12, 1.0, edgeValue));
      const tip = smoothstep(0.0, 0.18, strokeUv.x);
      return min(alpha, 0.42).mul(feather).mul(tip);
    })();
    material.userData.outlineParameters = { visible: false };
    material.userData.uniforms = {
      elapsed: this.elapsed,
      strength: this.strengthUniform,
      kick: this.kickUniform,
      steer: this.steerUniform,
      aspect: this.aspectUniform,
    };

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
    const step = clampValue(dt, 0, 0.05);
    const boosting = state.miniTurboTimer > 0;
    const speed = clampValue((Math.abs(state.vForward) - 5) / 15, 0, 1);
    if (boosting && !this.wasBoosting) this.kick = 1;
    this.wasBoosting = boosting;
    this.kick = Math.max(0, this.kick - step * 3.5);
    const target = speed * (boosting ? 0.8 + state.miniTurboTier * 0.06 : state.drifting ? 0.24 + state.driftCharge * 0.2 : 0);
    this.strength = damp(this.strength, target, target > this.strength ? 13 : 8, step);
    this.elapsed.value += step;
    this.strengthUniform.value = this.strength;
    this.kickUniform.value = this.kick;
    this.steerUniform.value = damp(this.steerUniform.value, state.steer, 6, step);
    this.aspectUniform.value = aspect;
    this.mesh.visible = this.strength > 0.005;
  }

  reset(): void {
    this.strength = this.kick = 0;
    this.wasBoosting = false;
    this.mesh.visible = false;
    this.elapsed.value = 0;
    this.strengthUniform.value = 0;
    this.kickUniform.value = 0;
    this.steerUniform.value = 0;
  }
}
