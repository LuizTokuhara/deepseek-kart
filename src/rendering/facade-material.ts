import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  abs,
  attribute,
  float,
  floor,
  fract,
  fwidth,
  materialColor,
  max,
  mix,
  normalGeometry,
  positionGeometry,
  referenceAttribute,
  smoothstep,
  step,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
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

/** Hash barato e determinístico para as janelas. */
const facadeHash = Fn(([p]: [any]) => {
  const q: any = fract(p.mul(0.3183099).add(0.1));
  const r: any = q.mul(17.0);
  return fract(r.x.mul(r.y).mul(r.z).mul(r.x.add(r.y).add(r.z)));
});

/**
 * Material de prédio: parede em cel shading com janelas desenhadas no
 * shader a partir de `facadeBoxGeometry`. As acesas emitem luz própria
 * (algumas passam do limiar do bloom); as apagadas são vidro escuro.
 */
export function facadeMaterial(): THREE.MeshToonNodeMaterial {
  const material = celMaterial(0xffffff);

  const instanceMatrix: any = referenceAttribute("instanceMatrix", "mat4");
  const size = vec3(
    instanceMatrix.mul(vec4(1, 0, 0, 0)).xyz.length(),
    instanceMatrix.mul(vec4(0, 1, 0, 0)).xyz.length(),
    instanceMatrix.mul(vec4(0, 0, 1, 0)).xyz.length(),
  ).toVarying("facadeSize");
  const local = positionGeometry.mul(size).toVarying("facadeLocal");
  const normal = normalGeometry.toVarying("facadeNormal");
  const data = attribute("facade", "vec4").toVarying("facadeData");

  // Janelas em grade: vãos de ~2,6 m por andar, cantos lisos e platibanda no
  // topo. À distância, quando um vão ocupa poucos pixels, a grade vira a cor
  // média. A função constrói o grafo de nós; cor e emissão usam cópias dele.
  const facadeSurface = () => {
    const glow = vec3(0.0).toVar();
    const diffuse = materialColor.toVar();

    If(abs(normal.y).lessThan(0.5), () => {
      const sideX = abs(normal.x).greaterThan(0.5);
      const faceWidth = sideX.select(size.z, size.x);
      const u = sideX.select(
        local.z.mul(normal.x.sign()),
        local.x.negate().mul(normal.z.sign()),
      ).add(faceWidth.mul(0.5));
      const v = local.y;
      const face = sideX.select(
        normal.x.greaterThan(0).select(1.0, 2.0),
        normal.z.greaterThan(0).select(3.0, 4.0),
      );
      const style = data.z;
      const floorHeight = data.w;
      const shop = style.greaterThan(1.5);
      const house = style.greaterThan(0.5).and(style.lessThan(1.5));
      const bays = max(1.0, floor(faceWidth.sub(1.6).div(2.6)));
      const bay = faceWidth.sub(1.6).div(bays);
      const bayU = u.sub(0.8).div(bay);
      const base = shop.select(4.3, house.select(0.5, 1.1));
      const floorV = v.sub(base).div(floorHeight);
      const column = floor(bayU);
      const row = floor(floorV);
      const inGrid = column.greaterThanEqual(0)
        .and(column.lessThan(bays))
        .and(row.greaterThanEqual(0))
        .and(base.add(row.add(1).mul(floorHeight)).lessThanEqual(size.y.sub(0.7)));
      const cell = vec2(fract(bayU).sub(0.5), fract(floorV).sub(0.55));
      const aa = vec2(fwidth(bayU), fwidth(floorV)).mul(1.25);
      const halfWidth = house.select(0.2, 0.3);
      const pane = float(1.0)
        .sub(smoothstep(halfWidth.sub(aa.x), halfWidth.add(aa.x), abs(cell.x)))
        .mul(
          float(1.0).sub(
            smoothstep(float(0.27).sub(aa.y), float(0.27).add(aa.y), abs(cell.y)),
          ),
        );
      const frameWidth = halfWidth.add(0.07);
      const frame = float(1.0)
        .sub(smoothstep(frameWidth.sub(aa.x), frameWidth.add(aa.x), abs(cell.x)))
        .mul(
          float(1.0).sub(
            smoothstep(float(0.34).sub(aa.y), float(0.34).add(aa.y), abs(cell.y)),
          ),
        );
      const paneValue = pane.mul(inGrid.select(1.0, 0.0)).toVar();
      const frameValue = frame.mul(inGrid.select(1.0, 0.0)).toVar();

      const random = facadeHash(vec3(column, row, face).add(data.x.mul(17.0)));
      // Algumas salas acesas por andar inteiro, como num escritório à noite.
      const wholeFloor = step(
        facadeHash(vec3(row, face, data.x)),
        house.select(0.0, 0.07),
      );
      const lit = max(step(random, data.y), wholeFloor).toVar();
      const warm = vec3(1.0, 0.7, 0.36);
      const cool = vec3(0.6, 0.78, 1.0);
      const windowGlow = mix(
        warm,
        cool,
        step(0.8, fract(random.mul(53.7))),
      ).mul(float(0.75).add(fract(random.mul(91.3)).mul(0.75))).toVar();
      // Persianas: só a metade de baixo de algumas janelas acende.
      windowGlow.mulAssign(
        mix(
          1.0,
          float(1.0).sub(smoothstep(-0.04, 0.08, cell.y)),
          step(0.7, fract(random.mul(31.1))),
        ),
      );

      If(
        shop
          .and(face.equal(3.0))
          .and(v.greaterThan(0.3))
          .and(v.lessThan(3.7))
          .and(u.greaterThan(0.6))
          .and(u.lessThan(faceWidth.sub(0.6))),
        () => {
          const mullion = abs(fract(u.sub(0.6).div(2.1)).sub(0.5)).mul(2.0);
          paneValue.assign(float(1.0).sub(smoothstep(0.9, 0.96, mullion)));
          frameValue.assign(1.0);
          lit.assign(1.0);
          windowGlow.assign(vec3(1.0, 0.8, 0.52).mul(1.7));
        },
      );

      const far = smoothstep(0.3, 0.75, max(aa.x, aa.y));
      const wall = materialColor;
      const glass = vec3(0.04, 0.05, 0.08);
      const near = mix(
        mix(wall, wall.mul(0.6), frameValue),
        glass,
        paneValue,
      );
      const coverage = inGrid.select(0.32, 0.0);
      diffuse.assign(mix(near, mix(wall, glass, coverage), far));
      glow.assign(
        mix(
          windowGlow.mul(paneValue).mul(lit),
          warm.mul(coverage).mul(data.y).mul(0.9),
          far,
        ),
      );
    }).Else(() => {
      diffuse.mulAssign(0.72);
    });

    return { diffuse, glow };
  };

  material.colorNode = Fn(() => facadeSurface().diffuse)();
  material.emissiveNode = Fn(() => facadeSurface().glow)();
  material.name = "lit-facade";
  return material;
}
