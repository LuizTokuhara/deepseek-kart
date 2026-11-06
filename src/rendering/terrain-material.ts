import * as THREE from "three";
import { iceDetailTexture } from "./ice-detail";
import { celMaterial } from "./cel-shading";

export type TerrainFinish = "grass" | "dirt" | "asphalt" | "snow" | "ice";
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
      const base =
        kind === "grass"
          ? 222 + Math.round(patch * 2) * 5
          : kind === "dirt"
            ? 236 + Math.round(patch * 2) * 3
            : kind === "snow"
              ? 247 + Math.round(patch) * 2
              : kind === "ice"
                ? 242 + Math.round(patch * 3) * 2
                : 239;
      const grain = random();
      const value = Math.max(
        0,
        Math.min(255, base - (grain < (kind === "ice" ? 0.035 : 0.07) ? 26 : 0)),
      );
      const i = (y * size + x) * 4;
      data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
    }
  }
  // Short painted grass blades / snow and ice scratches, wrapped across the tile.
  for (
    let n = 0;
    n < (kind === "grass" ? 140 : kind === "snow" ? 90 : 65);
    n++
  ) {
    const x = Math.floor(random() * size), y = Math.floor(random() * size);
    const length = kind === "grass" ? 3 : kind === "ice" ? 5 : 2;
    for (let j = 0; j < length; j++) {
      const i =
        (((y + j) % size) * size + (x + Math.floor(j / (kind === "ice" ? 2 : 1))) % size) *
        4;
      data[i] = data[i + 1] = data[i + 2] =
        kind === "ice" ? (n % 2 ? 212 : 255) : n % 3 ? 202 : 252;
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
export function terrainMaterial(color: number, kind: TerrainFinish, edgeFrost = false): THREE.MeshToonMaterial {
  const material = celMaterial(color);
  const texture = terrainTexture(kind);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainPattern = { value: texture };
    if (kind === "ice") shader.uniforms.iceDetail = { value: iceDetailTexture() };
    shader.uniforms.terrainScale = {
      value:
        kind === "grass"
          ? 0.075
          : kind === "snow"
            ? 0.09
            : kind === "ice"
              ? 0.16
              : 0.22,
    };
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
    if (kind === "ice") {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `
        #include <common>
        varying vec3 vIceWorldPosition;
        ${edgeFrost ? "attribute float iceEdge; varying float vIceEdge;" : ""}
      `).replace("#include <fog_vertex>", `
        #include <fog_vertex>
        vIceWorldPosition = terrainPosition.xyz;
        vIceWorldPosition = (modelMatrix * vec4(vIceWorldPosition, 1.0)).xyz;
        ${edgeFrost ? "vIceEdge = iceEdge;" : ""}
      `);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
        #include <common>
        uniform sampler2D iceDetail;
        varying vec3 vIceWorldPosition;
        ${edgeFrost ? "varying float vIceEdge;" : ""}
      `).replace("#include <opaque_fragment>", `
        vec3 iceView = normalize(cameraPosition - vIceWorldPosition);
        vec2 iceUv = vTerrainPosition * 0.065;
        // Camada interna desloca levemente sob a geada conforme o ponto de vista.
        vec2 buriedUv = iceUv + iceView.xz * 0.008;
        vec3 iceSurface = texture2D(iceDetail, iceUv).rgb;
        vec3 buried = texture2D(iceDetail, buriedUv).rgb;
        float frost = smoothstep(0.44, 0.86, iceSurface.g) * 0.22;
        ${edgeFrost ? "frost = max(frost, smoothstep(0.77, 0.99, vIceEdge + (iceSurface.g - 0.5) * 0.13) * 0.8);" : ""}
        vec3 clearIce = outgoingLight * mix(vec3(0.82, 0.95, 1.04), vec3(1.0), iceSurface.g);
        clearIce = mix(clearIce, vec3(0.14, 0.39, 0.5), buried.r * 0.22);
        clearIce += vec3(0.25, 0.36, 0.4) * (iceSurface.r * 0.3 + buried.b * 0.22);
        float grazing = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.0);
        float sheen = grazing * (1.0 - frost) * (0.13 + iceSurface.g * 0.12);
        clearIce = mix(clearIce, vec3(0.66, 0.78, 0.85), sheen);
        outgoingLight = mix(clearIce, vec3(0.79, 0.87, 0.91), frost);
        #include <opaque_fragment>
      `);
    }
  };
  material.customProgramCacheKey = () => `painted-terrain-v2-${kind}-${edgeFrost}`;
  return material;
}
