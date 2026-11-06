import * as THREE from "three";
import { iceDetailTexture } from "./ice-detail";
import { celMaterial } from "./cel-shading";
import { macroNoiseTexture } from "./macro-noise";

export type TerrainFinish = "grass" | "dirt" | "asphalt" | "snow" | "ice" | "sand" | "stone";
const textures = new Map<TerrainFinish, THREE.DataTexture>();

/** Where the shader reads the lateral road position for edge effects. */
export interface RoadEdgeOptions {
  /** `slab`: unit-box instances (local x is ±0.5); `mesh`: `roadEdge` attribute (0 centre, 1 edge). */
  readonly source: "slab" | "mesh";
  /** Half the paved width in meters, to size the gutter band. */
  readonly halfWidth: number;
}

/** Large-scale tone variation per finish; ice relies on its own detail layers. */
const MACRO_STRENGTH: Record<TerrainFinish, number> = {
  grass: 0.14, dirt: 0.13, asphalt: 0.1, snow: 0.05, ice: 0, sand: 0.1, stone: 0.07,
};
/** Darker band along paved road edges, so the road reads framed and worn. */
const ROAD_GUTTER_METERS = 2;
const ROAD_GUTTER_SHADE = 0.3;

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
      const i = (y * size + x) * 4;
      if (kind === "stone") {
        // Aparelho de blocos irregular, com juntas escuras e variação por
        // bloco. A cor vem do material da pista, então a textura é acromática.
        const rowHeight = 32;
        const columnWidth = 42;
        const row = Math.floor(y / rowHeight);
        const shiftedX = (x + (row % 2) * columnWidth * 0.5) % size;
        const column = Math.floor(shiftedX / columnWidth);
        const mortarX = shiftedX % columnWidth;
        const mortarY = y % rowHeight;
        let block = 238 + ((Math.imul(row + 3, 73) ^ Math.imul(column + 7, 151)) % 17) - 8;
        if (mortarX < 2 || mortarY < 2) block = 168 + random() * 18;
        else if (mortarX < 4 || mortarY < 4) block += 10;
        const grain = random();
        const value = Math.max(90, Math.min(255, block - (grain < 0.11 ? 30 : 0)));
        data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
        continue;
      }
      if (kind === "sand") {
        // Dunas vistas de cima: cristas largas e grãos finos, sem repetição óbvia.
        const a = x / size * Math.PI * 2;
        const b = y / size * Math.PI * 2;
        const ridge = Math.sin(a * 2 + Math.sin(b * 3) * 1.6) * 5 +
          Math.cos(b * 4 - Math.sin(a * 2) * 1.2) * 3;
        const grain = random();
        const value = Math.max(194, Math.min(255, 242 + ridge - (grain < 0.12 ? 24 : 0)));
        data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
        continue;
      }
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
      data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
    }
  }
  // Short painted grass blades / snow and ice scratches, wrapped across the tile.
  for (
    let n = 0;
    kind !== "stone" && kind !== "sand" &&
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

/**
 * World-space mapping avoids seams and stretching on overlapping road instances.
 * With `roadEdge`, ice frosts its edges and other finishes get a darker gutter.
 */
export function terrainMaterial(
  color: number,
  kind: TerrainFinish,
  roadEdge?: RoadEdgeOptions,
): THREE.MeshToonMaterial {
  const material = celMaterial(color);
  const texture = terrainTexture(kind);
  const macroStrength = MACRO_STRENGTH[kind];
  const edgeFrost = roadEdge !== undefined && kind === "ice";
  const gutter = roadEdge !== undefined && kind !== "ice";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainPattern = { value: texture };
    shader.uniforms.terrainMacroNoise = { value: macroNoiseTexture() };
    shader.uniforms.terrainMacroStrength = { value: macroStrength };
    shader.uniforms.roadGutterBand = {
      value: roadEdge ? ROAD_GUTTER_METERS / roadEdge.halfWidth : 0,
    };
    if (kind === "ice") shader.uniforms.iceDetail = { value: iceDetailTexture() };
    shader.uniforms.terrainScale = {
      value:
        kind === "grass"
          ? 0.075
          : kind === "snow"
            ? 0.09
            : kind === "ice"
              ? 0.16
              : kind === "sand"
                ? 0.055
                : kind === "stone"
                  ? 0.3
                  : 0.22,
    };
    // Signed lateral position: interpolates linearly across a slab's two edges.
    const lateral = roadEdge?.source === "slab" ? "position.x * 2.0" : "roadEdge";
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `
      #include <common>
      varying vec2 vTerrainPosition;
      ${roadEdge ? "varying float vRoadEdge;" : ""}
      ${roadEdge?.source === "mesh" ? "attribute float roadEdge;" : ""}
    `);
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
      #include <project_vertex>
      vec4 terrainPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        terrainPosition = instanceMatrix * terrainPosition;
      #endif
      vTerrainPosition = (modelMatrix * terrainPosition).xz;
      ${roadEdge ? `vRoadEdge = ${lateral};` : ""}
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      varying vec2 vTerrainPosition;
      uniform sampler2D terrainPattern;
      uniform float terrainScale;
      uniform sampler2D terrainMacroNoise;
      uniform float terrainMacroStrength;
      uniform float roadGutterBand;
      ${roadEdge ? "varying float vRoadEdge;" : ""}
    `).replace("#include <color_fragment>", `
      #include <color_fragment>
      diffuseColor.rgb *= texture2D(terrainPattern, vTerrainPosition * terrainScale).rgb;
      // Two low-frequency samples at unrelated scales and angles hide the tile period.
      float terrainMacro =
        texture2D(terrainMacroNoise, vTerrainPosition * 0.021).r * 0.6 +
        texture2D(terrainMacroNoise, mat2(0.8, -0.6, 0.6, 0.8) * vTerrainPosition * 0.047).r * 0.4;
      diffuseColor.rgb *= 1.0 + (terrainMacro - 0.5) * 2.0 * terrainMacroStrength;
      ${gutter ? `
      float roadGutter = smoothstep(1.0 - roadGutterBand, 1.0,
        abs(vRoadEdge) + (terrainMacro - 0.5) * roadGutterBand * 0.8);
      diffuseColor.rgb *= 1.0 - roadGutter * ${ROAD_GUTTER_SHADE.toFixed(3)};` : ""}
    `);
    if (kind === "ice") {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `
        #include <common>
        varying vec3 vIceWorldPosition;
      `).replace("#include <fog_vertex>", `
        #include <fog_vertex>
        vIceWorldPosition = terrainPosition.xyz;
        vIceWorldPosition = (modelMatrix * vec4(vIceWorldPosition, 1.0)).xyz;
      `);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
        #include <common>
        uniform sampler2D iceDetail;
        varying vec3 vIceWorldPosition;
      `).replace("#include <opaque_fragment>", `
        vec3 iceView = normalize(cameraPosition - vIceWorldPosition);
        vec2 iceUv = vTerrainPosition * 0.065;
        // Camada interna desloca levemente sob a geada conforme o ponto de vista.
        vec2 buriedUv = iceUv + iceView.xz * 0.008;
        vec3 iceSurface = texture2D(iceDetail, iceUv).rgb;
        vec3 buried = texture2D(iceDetail, buriedUv).rgb;
        float frost = smoothstep(0.44, 0.86, iceSurface.g) * 0.22;
        ${edgeFrost ? "frost = max(frost, smoothstep(0.77, 0.99, abs(vRoadEdge) + (iceSurface.g - 0.5) * 0.13) * 0.8);" : ""}
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
  material.customProgramCacheKey = () => `painted-terrain-v3-${kind}-${roadEdge?.source ?? "none"}`;
  return material;
}
