import * as THREE from "three/webgpu";
import {
  Fn,
  abs,
  float,
  fwidth,
  length,
  max,
  mix,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";

/** Painted depth bands and slow foam lines, without reflections/post-processing. */
export function paintedWater(): THREE.MeshBasicNodeMaterial {
  const time = uniform(0);
  const deep = uniform(new THREE.Color(0x248b9f));
  const middle = uniform(new THREE.Color(0x39b3ba));
  const shallow = uniform(new THREE.Color(0x7cd4c0));
  const foam = uniform(new THREE.Color(0xe5f6dc));

  const color = Fn(() => {
    const waterUv = uv();
    const p = waterUv.mul(2).sub(1);
    const r = length(p);
    const wave = sin(p.x.mul(9).add(p.y.mul(5)).add(time.mul(0.7))).mul(0.012);
    const aa = max(fwidth(r), 0.002);
    const middleEdge = float(0.55);
    const shallowEdge = float(0.83);
    let water = mix(
      deep,
      middle,
      smoothstep(middleEdge.sub(aa), middleEdge.add(aa), r.add(wave)),
    );
    water = mix(
      water,
      shallow,
      smoothstep(shallowEdge.sub(aa), shallowEdge.add(aa), r.add(wave)),
    );
    const edge = abs(r.sub(0.96).add(wave.mul(0.5)));
    const shoreFoam = float(1).sub(smoothstep(0.008, aa.add(0.008), edge));
    const line = abs(
      sin(p.y.mul(38).add(sin(p.x.mul(13).add(time.mul(0.5)))).add(time.mul(0.6))),
    );
    const glint = float(1).sub(smoothstep(0.02, 0.1, line))
      .mul(smoothstep(0.6, 0.9, sin(p.x.mul(27).add(p.y.mul(8)))));
    water = mix(
      water,
      foam,
      shoreFoam.mul(0.75).add(glint.mul(0.16).mul(float(1).sub(r))),
    );
    return water;
  })();

  const material = new THREE.MeshBasicNodeMaterial({ fog: true });
  material.colorNode = color;
  material.userData.outlineParameters = { visible: false };
  material.userData.time = time;
  material.name = "painted-water";
  return material;
}
