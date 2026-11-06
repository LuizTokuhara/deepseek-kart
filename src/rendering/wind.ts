import * as THREE from "three";

/** Relógio comum a toda vegetação; parado com movimento reduzido. */
const windTime: THREE.IUniform<number> = { value: 0 };

/** Como um material balança, em unidades locais da geometria. */
export interface WindOptions {
  /** Deslocamento máximo, em metros, no topo da planta. */
  readonly strength: number;
  /** Altura local abaixo da qual nada se move (base, tronco). */
  readonly from: number;
  /** Altura local em que o balanço chega a `strength`. */
  readonly to: number;
  /** Velocidade da oscilação principal, em rad/s. */
  readonly speed?: number;
  /** Instâncias encolhem para o chão entre estas distâncias da câmera. */
  readonly fade?: { readonly near: number; readonly far: number };
}

/** Avança o vento; com `frozen`, a vegetação fica parada. */
export function advanceWind(dt: number, frozen: boolean): void {
  if (!frozen) windTime.value += dt;
}

const glsl = (value: number): string => value.toFixed(4);

/**
 * Aplicado depois de `project_vertex`, em espaço de vista: a direção do vento
 * é a mesma para toda instância, seja qual for a rotação dela. A fase vem da
 * posição de cada planta, então vizinhas balançam quase juntas, como numa rajada.
 */
function windChunk(options: WindOptions): string {
  const speed = options.speed ?? 1.6;
  const fade = options.fade;
  return /* glsl */ `
    #ifdef USE_INSTANCING
      vec4 windOrigin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    #else
      vec4 windOrigin = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    #endif
    float windPhase = dot(windOrigin.xz, vec2(0.13, 0.09));
    float windGust = 0.6 + 0.4 * sin(windTime * 0.31 + windOrigin.x * 0.025 + windOrigin.z * 0.017);
    float windSway = sin(windTime * ${glsl(speed)} + windPhase) * 0.75 +
      sin(windTime * ${glsl(speed * 2.3)} + windPhase * 1.7) * 0.25;
    float windBend = smoothstep(${glsl(options.from)}, ${glsl(options.to)}, transformed.y);
    vec3 windOffset = vec3(0.8, 0.0, 0.6) *
      (windSway * windGust * windBend * ${glsl(options.strength)});
    mvPosition.xyz += (viewMatrix * vec4(windOffset, 0.0)).xyz;
    ${fade ? `
    vec3 windOriginView = (viewMatrix * windOrigin).xyz;
    float windFade = 1.0 -
      smoothstep(${glsl(fade.near)}, ${glsl(fade.far)}, length(windOriginView));
    mvPosition.xyz = mix(windOriginView, mvPosition.xyz, windFade);` : ""}
    gl_Position = projectionMatrix * mvPosition;
  `;
}

/**
 * Faz o material balançar com o vento, preservando qualquer `onBeforeCompile`
 * anterior. Funciona em materiais padrão, de profundidade e `ShaderMaterial`
 * que incluam `common` e `project_vertex`.
 */
export function applyWind(material: THREE.Material, options: WindOptions): void {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.windTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float windTime;")
      .replace("#include <project_vertex>", `#include <project_vertex>\n${windChunk(options)}`);
  };
  const key = JSON.stringify(options);
  material.customProgramCacheKey = () => `${previousKey.call(material)}|wind:${key}`;
}

/** Sombra que acompanha o balanço; sem `fade`, que dependeria da câmera da luz. */
export function windDepthMaterial(options: WindOptions): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  applyWind(material, { ...options, fade: undefined });
  return material;
}
