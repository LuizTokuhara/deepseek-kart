import * as THREE from "three";

export interface SnowfallOptions {
  readonly count: number;
  readonly radius: number;
}

/** Um único draw call; flocos em coordenadas de mundo, reciclados só nas bordas. */
export class Snowfall {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(options: SnowfallOptions) {
    const count = Math.max(0, Math.min(1200, Math.floor(options.count)));
    const radius = Math.max(8, options.radius);
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    let seed = 93621;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (random() - 0.5) * radius * 2;
      positions[i * 3 + 1] = random() * 18;
      positions[i * 3 + 2] = (random() - 0.5) * radius * 2;
      sizes[i] = 0.035 + random() * 0.045;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("flakeSize", new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        elapsed: { value: 0 },
        anchor: { value: new THREE.Vector3() },
        radius: { value: radius },
        pixelScale: { value: 500 },
      },
      vertexShader: `
        #include <common>
        #include <fog_pars_vertex>
        uniform float elapsed;
        uniform vec3 anchor;
        uniform float radius;
        uniform float pixelScale;
        attribute float flakeSize;
        varying float opacity;
        void main() {
          vec3 world = position;
          float phase = position.x * 0.4 + position.z * 0.7;
          world.x += elapsed * 0.85 + sin(elapsed * 0.35 + phase) * 0.8;
          world.z += elapsed * 0.3 + cos(elapsed * 0.28 + phase) * 0.45;
          world.xz = mod(world.xz - anchor.xz + radius, radius * 2.0) - radius + anchor.xz;
          world.y = mod(world.y - elapsed * (0.85 + flakeSize * 8.0) - anchor.y + 4.0, 18.0) + anchor.y - 4.0;
          vec4 mvPosition = viewMatrix * vec4(world, 1.0);
          float distanceToCamera = -mvPosition.z;
          opacity = smoothstep(1.5, 4.0, distanceToCamera) * (1.0 - smoothstep(radius * 0.7, radius, length(world.xz - anchor.xz)));
          gl_PointSize = clamp(flakeSize * 3.0 * pixelScale / max(distanceToCamera, 1.0), 2.0, 14.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        varying float opacity;
        void main() {
          float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float alpha = (1.0 - smoothstep(0.4, 1.0, r)) * opacity * 0.9;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(0.91, 0.96, 1.0, alpha);
          #include <fog_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    material.userData.outlineParameters = { visible: false };
    this.points = new THREE.Points(geometry, material);
    this.points.name = "winter-snowfall";
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  update(dt: number, cameraPosition: THREE.Vector3, viewportHeight: number, reducedMotion = false): void {
    this.points.visible = !reducedMotion;
    const uniforms = this.points.material.uniforms;
    uniforms.anchor.value.copy(cameraPosition);
    uniforms.pixelScale.value = viewportHeight * 0.75;
    if (!reducedMotion) uniforms.elapsed.value += Math.max(0, Math.min(dt, 0.05));
  }
}
