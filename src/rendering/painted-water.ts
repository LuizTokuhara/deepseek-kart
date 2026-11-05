import * as THREE from "three";

/** Painted depth bands and slow foam lines, without reflections/post-processing. */
export function paintedWater(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      time: { value: 0 },
      deep: { value: new THREE.Color(0x248b9f) },
      middle: { value: new THREE.Color(0x39b3ba) },
      shallow: { value: new THREE.Color(0x7cd4c0) },
      foam: { value: new THREE.Color(0xe5f6dc) },
    },
    vertexShader: `varying vec2 waterUv;
      #include <fog_pars_vertex>
      void main() {
        waterUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `varying vec2 waterUv;
      uniform float time;
      uniform vec3 deep, middle, shallow, foam;
      #include <fog_pars_fragment>
      void main() {
        vec2 p = waterUv * 2.0 - 1.0;
        float r = length(p);
        float wave = sin(p.x * 9.0 + p.y * 5.0 + time * 0.7) * 0.012;
        float aa = max(fwidth(r), 0.002);
        vec3 color = mix(deep, middle, smoothstep(0.55-aa, 0.55+aa, r+wave));
        color = mix(color, shallow, smoothstep(0.83-aa, 0.83+aa, r+wave));
        float edge = abs(r - 0.96 + wave * 0.5);
        float shoreFoam = 1.0 - smoothstep(0.008, 0.008+aa, edge);
        float line = abs(sin(p.y * 38.0 + sin(p.x * 13.0 + time * 0.5) + time * 0.6));
        float glint = (1.0-smoothstep(0.02, 0.1, line)) * smoothstep(0.6, 0.9, sin(p.x * 27.0 + p.y * 8.0));
        color = mix(color, foam, shoreFoam * 0.75 + glint * 0.16 * (1.0-r));
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
  material.userData.outlineParameters = { visible: false };
  return material;
}
