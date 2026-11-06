import * as THREE from "three";
import { celMaterial } from "./cel-shading";

/** Estilos de fachada: escritório, casa ou loja com vitrine no térreo. */
export const FACADE_STYLE = { office: 0, house: 1, shop: 2 } as const;

/** Dados de uma fachada, lidos por instância no shader. */
export interface FacadeData {
  /** Semente das janelas acesas. */
  readonly seed: number;
  /** Fração de janelas acesas (0–1). */
  readonly lit: number;
  readonly style: (typeof FACADE_STYLE)[keyof typeof FACADE_STYLE];
  /** Altura de cada andar, em metros. */
  readonly floorHeight: number;
}

/** Caixa unitária com a base em y = 0, escalada por instância até o tamanho do prédio. */
export function facadeBoxGeometry(data: readonly FacadeData[]): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  geometry.deleteAttribute("uv");
  const values = new Float32Array(Math.max(1, data.length) * 4);
  data.forEach((facade, index) => values.set(
    [facade.seed, facade.lit, facade.style, facade.floorHeight], index * 4));
  geometry.setAttribute("facade", new THREE.InstancedBufferAttribute(values, 4));
  return geometry;
}

const VERTEX_PARS = /* glsl */ `
  attribute vec4 facade;
  varying vec3 vFacadeLocal;
  varying vec3 vFacadeSize;
  varying vec3 vFacadeNormal;
  varying vec4 vFacade;
`;

const VERTEX = /* glsl */ `
  #ifdef USE_INSTANCING
    vFacadeSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz),
      length(instanceMatrix[2].xyz));
  #else
    vFacadeSize = vec3(1.0);
  #endif
  vFacadeLocal = position * vFacadeSize;
  vFacadeNormal = normal;
  vFacade = facade;
`;

const FRAGMENT_PARS = /* glsl */ `
  varying vec3 vFacadeLocal;
  varying vec3 vFacadeSize;
  varying vec3 vFacadeNormal;
  varying vec4 vFacade;
  float facadeHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
`;

// Janelas em grade: vãos de ~2,6 m por andar, cantos lisos e platibanda no topo.
// À distância, quando um vão ocupa poucos pixels, a grade vira a cor média.
const FRAGMENT = /* glsl */ `
  vec3 facadeGlow = vec3(0.0);
  if (abs(vFacadeNormal.y) < 0.5) {
    bool sideX = abs(vFacadeNormal.x) > 0.5;
    float faceWidth = sideX ? vFacadeSize.z : vFacadeSize.x;
    float u = (sideX ? vFacadeLocal.z * sign(vFacadeNormal.x)
      : -vFacadeLocal.x * sign(vFacadeNormal.z)) + faceWidth * 0.5;
    float v = vFacadeLocal.y;
    float face = sideX ? (vFacadeNormal.x > 0.0 ? 1.0 : 2.0) : (vFacadeNormal.z > 0.0 ? 3.0 : 4.0);
    float style = vFacade.z;
    float floorHeight = vFacade.w;
    bool shop = style > 1.5;
    bool house = style > 0.5 && style < 1.5;
    float bays = max(1.0, floor((faceWidth - 1.6) / 2.6));
    float bay = (faceWidth - 1.6) / bays;
    float bayU = (u - 0.8) / bay;
    float base = shop ? 4.3 : (house ? 0.5 : 1.1);
    float floorV = (v - base) / floorHeight;
    float column = floor(bayU);
    float row = floor(floorV);
    bool inGrid = column >= 0.0 && column < bays && row >= 0.0 &&
      base + (row + 1.0) * floorHeight <= vFacadeSize.y - 0.7;
    vec2 cell = vec2(fract(bayU) - 0.5, fract(floorV) - 0.55);
    vec2 aa = vec2(fwidth(bayU), fwidth(floorV)) * 1.25;
    float halfWidth = house ? 0.2 : 0.3;
    float pane = (1.0 - smoothstep(halfWidth - aa.x, halfWidth + aa.x, abs(cell.x))) *
      (1.0 - smoothstep(0.27 - aa.y, 0.27 + aa.y, abs(cell.y)));
    float frameWidth = halfWidth + 0.07;
    float frame = (1.0 - smoothstep(frameWidth - aa.x, frameWidth + aa.x, abs(cell.x))) *
      (1.0 - smoothstep(0.34 - aa.y, 0.34 + aa.y, abs(cell.y)));
    pane *= inGrid ? 1.0 : 0.0;
    frame *= inGrid ? 1.0 : 0.0;

    float random = facadeHash(vec3(column, row, face) + vFacade.x * 17.0);
    // Algumas salas acesas por andar inteiro, como num escritório à noite.
    float wholeFloor = step(facadeHash(vec3(row, face, vFacade.x)), house ? 0.0 : 0.07);
    float lit = max(step(random, vFacade.y), wholeFloor);
    vec3 warm = vec3(1.0, 0.7, 0.36);
    vec3 cool = vec3(0.6, 0.78, 1.0);
    vec3 glow = mix(warm, cool, step(0.8, fract(random * 53.7))) *
      (0.75 + fract(random * 91.3) * 0.75);
    // Persianas: só a metade de baixo de algumas janelas acende.
    glow *= mix(1.0, smoothstep(0.08, -0.04, cell.y), step(0.7, fract(random * 31.1)));

    if (shop && face == 3.0 && v > 0.3 && v < 3.7 && u > 0.6 && u < faceWidth - 0.6) {
      float mullion = abs(fract((u - 0.6) / 2.1) - 0.5) * 2.0;
      pane = 1.0 - smoothstep(0.9, 0.96, mullion);
      frame = 1.0;
      lit = 1.0;
      glow = vec3(1.0, 0.8, 0.52) * 1.7;
    }

    float far = smoothstep(0.3, 0.75, max(aa.x, aa.y));
    vec3 wall = diffuseColor.rgb;
    vec3 glass = vec3(0.04, 0.05, 0.08);
    vec3 near = mix(mix(wall, wall * 0.6, frame), glass, pane);
    float coverage = inGrid ? 0.32 : 0.0;
    diffuseColor.rgb = mix(near, mix(wall, glass, coverage), far);
    facadeGlow = mix(glow * pane * lit, warm * coverage * vFacade.y * 0.9, far);
  } else {
    diffuseColor.rgb *= 0.72;
  }
`;

/**
 * Material de prédio: parede em cel shading com janelas desenhadas no
 * shader a partir de `facadeBoxGeometry`. As acesas emitem luz própria
 * (algumas passam do limiar do bloom); as apagadas são vidro escuro.
 */
export function facadeMaterial(): THREE.MeshToonMaterial {
  const material = celMaterial(0xffffff);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_PARS}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAGMENT}`)
      .replace("#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += facadeGlow;");
  };
  material.customProgramCacheKey = () => "lit-facade-v1";
  return material;
}
