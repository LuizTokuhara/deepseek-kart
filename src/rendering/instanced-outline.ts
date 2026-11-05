import * as THREE from "three";

/** Inverted hull with per-instance normals and a constant CSS-pixel stroke.
 * OutlineEffect's normal extrusion does not apply instanceMatrix to its second
 * projected point, so translated/nonuniformly scaled batches need this pass.
 */
export function createInstancedOutline(source: THREE.InstancedMesh, pixels = 1.15): THREE.InstancedMesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      viewport: { value: new THREE.Vector2(1, 1) },
      strokePixels: { value: pixels },
    },
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      uniform vec2 viewport;
      uniform float strokePixels;
      void main() {
        vec3 transformed = position;
        #include <project_vertex>
        vec3 outward = normal;
        #ifdef USE_INSTANCING
          mat3 im = mat3(instanceMatrix);
          outward /= vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
          outward = im * outward;
        #endif
        outward = normalize(normalMatrix * outward);
        vec4 tip = projectionMatrix * vec4(mvPosition.xyz + outward, 1.0);
        vec2 direction = (tip.xy / tip.w - gl_Position.xy / gl_Position.w) * viewport;
        direction /= max(length(direction), 0.00001);
        gl_Position.xy += direction * (2.0 * strokePixels / viewport) * gl_Position.w;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    side: THREE.BackSide,
    fog: true,
    depthWrite: false,
  });
  material.userData.outlineParameters = { visible: false };
  const outline = new THREE.InstancedMesh(source.geometry, material, source.count);
  outline.name = `${source.name}-outline`;
  outline.instanceMatrix = source.instanceMatrix;
  outline.frustumCulled = source.frustumCulled;
  outline.renderOrder = 1;
  outline.onBeforeRender = (renderer) => {
    renderer.getSize(material.uniforms.viewport.value);
  };
  return outline;
}
