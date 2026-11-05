import * as THREE from "three";

/** Camera-centered sky dome; horizon color also matches the course fog. */
export function createSky(zenith: number, horizon: number): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(zenith) },
      horizon: { value: new THREE.Color(horizon) },
    },
    vertexShader: `varying vec3 vSkyDirection;
      void main() {
        vSkyDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon;
      varying vec3 vSkyDirection;
      void main() {
        float height = max(normalize(vSkyDirection).y, 0.0);
        gl_FragColor = vec4(mix(horizon, zenith, smoothstep(0.0, 0.75, height)), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });
  material.userData.outlineParameters = { visible: false };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 12), material);
  sky.name = "gradient-sky";
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  return sky;
}
