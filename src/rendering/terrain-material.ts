import * as THREE from "three";
import { celMaterial } from "./cel-shading";

export type TerrainFinish = "grass" | "dirt" | "asphalt";
const textures = new Map<TerrainFinish, THREE.DataTexture>();

/** Small, seamless painted patterns, generated once and shared by every course. */
function terrainTexture(kind: TerrainFinish): THREE.DataTexture {
  const cached = textures.get(kind);
  if (cached) return cached;
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let seed = 417;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = x / size * Math.PI * 2;
      const b = y / size * Math.PI * 2;
      const patch = Math.sin(a + Math.sin(b)) + Math.cos(b * 2 - Math.cos(a));
      const base = kind === "grass" ? 222 + Math.round(patch * 2) * 5
        : kind === "dirt" ? 236 + Math.round(patch * 2) * 3 : 239;
      const grain = random();
      const value = Math.max(0, Math.min(255, base - (grain < 0.07 ? 26 : 0)));
      const i = (y * size + x) * 4;
      data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
    }
  }
  // Short painted grass blades / sand flecks, wrapped across the tile boundary.
  for (let n = 0; n < (kind === "grass" ? 140 : 65); n++) {
    const x = Math.floor(random() * size), y = Math.floor(random() * size);
    const length = kind === "grass" ? 3 : 2;
    for (let j = 0; j < length; j++) {
      const i = (((y + j) % size) * size + (x + Math.floor(j / 2)) % size) * 4;
      data[i] = data[i + 1] = data[i + 2] = n % 3 ? 202 : 252;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = `painted-${kind}`;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  textures.set(kind, texture);
  return texture;
}

/** World-space mapping avoids seams and stretching on overlapping road instances. */
export function terrainMaterial(color: number, kind: TerrainFinish): THREE.MeshToonMaterial {
  const material = celMaterial(color);
  const texture = terrainTexture(kind);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainPattern = { value: texture };
    shader.uniforms.terrainScale = { value: kind === "grass" ? 0.075 : 0.22 };
    shader.vertexShader = shader.vertexShader.replace("#include <common>",
      "#include <common>\nvarying vec2 vTerrainPosition;");
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
      #include <project_vertex>
      vec4 terrainPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        terrainPosition = instanceMatrix * terrainPosition;
      #endif
      vTerrainPosition = (modelMatrix * terrainPosition).xz;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      varying vec2 vTerrainPosition;
      uniform sampler2D terrainPattern;
      uniform float terrainScale;
    `).replace("#include <color_fragment>", `
      #include <color_fragment>
      diffuseColor.rgb *= texture2D(terrainPattern, vTerrainPosition * terrainScale).rgb;
    `);
  };
  material.customProgramCacheKey = () => "painted-terrain-v1";
  return material;
}
