import * as THREE from "three/webgpu";
import {
  Fn,
  abs,
  attribute,
  cameraPosition,
  float,
  fwidth,
  materialColor,
  max,
  mix,
  mx_worley_noise_vec2,
  normalize,
  normalView,
  positionGeometry,
  positionViewDirection,
  positionWorld,
  pow,
  sin,
  smoothstep,
  texture,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { iceDetailTexture } from "./ice-detail";
import { celMaterial } from "./cel-shading";
import { macroNoiseTexture } from "./macro-noise";
import { puddleMask, wetShade, wetSheen, type WetFinish } from "./wet-surface";

/** Finish the lit ice before the shared fog/alpha stage. */
class IceMaterial extends THREE.MeshToonNodeMaterial {
  static override get type(): string { return "PaintedIceMaterial"; }
  finishLighting: (light: THREE.Node<"vec3">) => THREE.Node<"vec3"> = (light) => light;

  override customProgramCacheKey(): string {
    return `${super.customProgramCacheKey()}-${this.userData.terrain?.edge ?? "none"}`;
  }

  override setupOutput(builder: THREE.NodeBuilder, output: THREE.Node): THREE.Node {
    const rgba = vec4(output as THREE.Node<"vec4">);
    return super.setupOutput(builder, vec4(this.finishLighting(rgba.rgb), rgba.a));
  }
}

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

/**
 * Painted wear on driven surfaces (darkening/brightening factors): rubbered
 * wheel paths, stains (oil on asphalt, damp patches on dirt) and dusty patches.
 */
const ROAD_WEAR: Partial<Record<TerrainFinish, { groove: number; stain: number; dust: number }>> = {
  asphalt: { groove: 0.42, stain: 0.3, dust: 0.12 },
  dirt: { groove: 0.32, stain: 0.2, dust: 0.12 },
  sand: { groove: 0.24, stain: 0.12, dust: 0.1 },
  stone: { groove: 0.16, stain: 0.14, dust: 0.08 },
};
/**
 * Inked crack patches on driven roads: crazing where the cell noise borders
 * meet, only inside sparse macro-noise patches. `shade` is the crack tone.
 */
const ROAD_CRACKS: Partial<Record<TerrainFinish, { shade: number }>> = {
  asphalt: { shade: 0.34 },
  dirt: { shade: 0.5 },
  stone: { shade: 0.42 },
};
/** Crack cells per meter. */
const CRACK_SCALE = 0.9;

/**
 * Wheel paths, in meters from the road center, with their wear: the wheels of
 * a kart on the center line (±0.7 m) and on the AI's ±2.5 m lanes.
 */
const WHEEL_PATHS = [
  { offset: 0.7, wear: 1 },
  { offset: 1.8, wear: 0.7 },
  { offset: 3.2, wear: 0.7 },
] as const;
const WHEEL_PATH_HALF_WIDTH = 0.24;

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
        // Irregular block masonry, with dark joints and per-block
        // variation. The color comes from the course material, so the texture is achromatic.
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
        // Dunes seen from above: wide ridges and fine grain, without obvious repetition.
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
 * Brightness factor for road wear. Wheel paths wander a little and fade in and
 * out along the lap; stains and dust are soft blobs a few meters across.
 */
function roadWear(
  world: THREE.Node<"vec2">,
  lateralMeters: THREE.Node<"float">,
  wear: { groove: number; stain: number; dust: number },
): THREE.Node<"float"> {
  const macro = texture(macroNoiseTexture());
  const wander = texture(macro, world.mul(0.014)).r.sub(0.5).mul(0.9);
  const lateral = lateralMeters.add(wander);
  let paths: THREE.Node<"float"> = float(0);
  for (const path of WHEEL_PATHS) {
    const groove = float(1).sub(smoothstep(0, WHEEL_PATH_HALF_WIDTH, abs(lateral.sub(path.offset))));
    paths = max(paths, groove.mul(path.wear));
  }
  // Long stretches of rubber that come and go, combed into fine lines that run
  // with the lane (they depend on the lateral position only).
  const stretch = smoothstep(0.22, 0.5, texture(macro, world.mul(0.012).add(vec2(0.31, 0.77))).r);
  const streaks = sin(lateral.mul(43)).mul(sin(lateral.mul(19).add(1.3))).mul(0.4).add(0.6);
  const grooves = paths.mul(stretch).mul(streaks).mul(wear.groove);

  const stains = smoothstep(0.66, 0.8, texture(macro, world.mul(0.11).add(vec2(0.53, 0.19))).r)
    .mul(wear.stain);
  const dust = smoothstep(0.34, 0.2, texture(macro, world.mul(0.07).add(vec2(0.11, 0.62))).r)
    .mul(wear.dust);
  return float(1).sub(grooves).sub(stains).add(dust);
}

/**
 * Multiplier that inks hairline cracks: a pixel-wide line where two cells of
 * the Worley noise meet, inside sparse patches, fading once a cell shrinks to
 * a few pixels so distant road does not turn to noise.
 */
function roadCracks(
  world: THREE.Node<"vec2">,
  macro: THREE.TextureNode,
  shade: number,
): THREE.Node<"float"> {
  // Warp the cells so the borders wander like real cracks, not paving joints.
  const warp = vec2(
    texture(macro, world.mul(0.23)).r,
    texture(macro, world.mul(0.23).add(0.5)).r,
  ).sub(0.5).mul(0.9);
  const cellUv = world.mul(CRACK_SCALE).add(warp);
  const cells = mx_worley_noise_vec2(cellUv);
  // F2 − F1 grows about twice as fast as the cell coordinate across a border;
  // measuring against the coordinate's footprint keeps the line unbroken.
  const pixel = fwidth(cellUv).length().max(0.00001);
  const crack = smoothstep(1.2, 0.4, cells.y.sub(cells.x).div(pixel.mul(2)));
  // Only some borders crack, and only inside sparse patches.
  const breakup = smoothstep(0.42, 0.58, texture(macro, world.mul(0.37).add(0.11)).r);
  const patch = smoothstep(0.58, 0.68, texture(macro, world.mul(0.031).add(0.37)).r);
  const near = smoothstep(0.12, 0.06, pixel);
  return float(1).sub(crack.mul(breakup).mul(patch).mul(near).mul(1 - shade));
}

/**
 * World-space mapping avoids seams and stretching on overlapping road instances.
 * With `roadEdge`, ice frosts its edges and other finishes get a darker gutter.
 * `wet` soaks the ground: darker paint, puddles (water also pools along the road
 * edges) and a sky sheen at grazing angles.
 */
export function terrainMaterial(
  color: number,
  kind: TerrainFinish,
  roadEdge?: RoadEdgeOptions,
  wet?: WetFinish,
): THREE.MeshToonNodeMaterial {
  const base = celMaterial(color);
  const material = kind === "ice" ? new IceMaterial().copy(base) : base;
  const pattern = texture(terrainTexture(kind));
  const macro = texture(macroNoiseTexture());
  const macroStrength = MACRO_STRENGTH[kind];
  const edgeFrost = roadEdge !== undefined && kind === "ice";
  const gutter = roadEdge !== undefined && kind !== "ice";
  const gutterBand = roadEdge ? ROAD_GUTTER_METERS / roadEdge.halfWidth : 0;
  const wear = gutter ? ROAD_WEAR[kind] : undefined;
  const cracks = gutter ? ROAD_CRACKS[kind] : undefined;
  const scale =
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
              : 0.22;

  const world = positionWorld.xz;
  const roadEdgeValue = roadEdge
    ? (roadEdge.source === "slab"
      ? positionGeometry.x.mul(2)
      : attribute("roadEdge", "float")).toVarying("roadEdgeValue")
    : null;
  const iceDetail = kind === "ice" ? texture(iceDetailTexture()) : null;

  // Rain collects in patches and, on roads, along the gutters.
  const puddles = wet
    ? (roadEdgeValue
      ? max(puddleMask(world), smoothstep(0.9, 1, abs(roadEdgeValue)).mul(puddleMask(world.mul(2.3))
        .add(0.35).min(1)))
      : puddleMask(world))
    : null;
  material.colorNode = Fn(() => {
    const terrainPattern = texture(pattern, world.mul(scale)).rgb;
    let surface = materialColor.mul(terrainPattern);
    // Two low-frequency samples at unrelated scales and angles hide the tile period.
    const rotated = vec2(
      world.x.mul(0.8).add(world.y.mul(-0.6)),
      world.x.mul(0.6).add(world.y.mul(0.8)),
    ).mul(0.047);
    const terrainMacro = texture(macro, world.mul(0.021)).r.mul(0.6)
      .add(texture(macro, rotated).r.mul(0.4));
    surface = surface.mul(
      float(1).add(terrainMacro.sub(0.5).mul(2).mul(macroStrength)),
    );

    if (gutter && roadEdgeValue) {
      const roadGutter = smoothstep(
        float(1).sub(gutterBand),
        1,
        abs(roadEdgeValue).add(terrainMacro.sub(0.5).mul(gutterBand).mul(0.8)),
      );
      surface = surface.mul(float(1).sub(roadGutter.mul(ROAD_GUTTER_SHADE)));
      if (wear) {
        surface = surface.mul(roadWear(world, abs(roadEdgeValue).mul(roadEdge!.halfWidth), wear));
      }
      if (cracks) surface = surface.mul(roadCracks(world, macro, cracks.shade));
    }
    if (wet) surface = surface.mul(wetShade(puddles!));
    return surface;
  })();
  if (wet) material.emissiveNode = wetSheen(wet, puddles!);

  if (iceDetail && material instanceof IceMaterial) {
    material.finishLighting = (light) => Fn(() => {
      const view = cameraPosition.sub(positionWorld);
      const iceUv = world.mul(0.065);
      // The inner layer shifts slightly beneath the frost with the viewing angle.
      const buriedUv = iceUv.add(normalize(view).xz.mul(0.008));
      const iceSurface = texture(iceDetail, iceUv).rgb;
      const buried = texture(iceDetail, buriedUv).rgb;
      let frost = smoothstep(0.44, 0.86, iceSurface.g).mul(0.22);
      if (edgeFrost && roadEdgeValue) {
        frost = max(
          frost,
          smoothstep(
            0.77,
            0.99,
            abs(roadEdgeValue).add(iceSurface.g.sub(0.5).mul(0.13)),
          ).mul(0.8),
        );
      }
      let clearIce = vec3(light).mul(
        mix(vec3(0.82, 0.95, 1.04), vec3(1.0), iceSurface.g),
      );
      clearIce = mix(clearIce, vec3(0.14, 0.39, 0.5), buried.r.mul(0.22));
      clearIce = clearIce.add(
        vec3(0.25, 0.36, 0.4).mul(
          iceSurface.r.mul(0.3).add(buried.b.mul(0.22)),
        ),
      );
      const grazing = pow(
        float(1).sub(max(normalView.dot(positionViewDirection), 0)),
        3,
      );
      const sheen = grazing.mul(float(1).sub(frost)).mul(
        float(0.13).add(iceSurface.g.mul(0.12)),
      );
      clearIce = mix(clearIce, vec3(0.66, 0.78, 0.85), sheen);
      return mix(clearIce, vec3(0.79, 0.87, 0.91), frost);
    })();
  }
  material.userData.terrain = {
    kind,
    edge: roadEdge?.source ?? null,
    gutterBand,
    edgeFrost,
    wet: wet !== undefined,
  };
  material.name = `painted-terrain-${kind}`;
  return material;
}
