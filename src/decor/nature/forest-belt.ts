import * as THREE from "three";
import { fractalNoise2D } from "../../core/noise";
import { celMaterial } from "../../rendering/cel-shading";
import { createInstancedOutline } from "../../rendering/instanced-outline";
import { applyWind, type WindOptions } from "../../rendering/wind";
import { pathDistance } from "../../tracks/relief";
import type { TrackLike } from "../../tracks/track";
import { randomGenerator } from "../common";
import { farConiferGeometry, farTreeGeometry } from "./ground-cover-shapes";
import { scatterPoints } from "./scatter";

export interface ForestBeltOptions {
  readonly seed: number;
  /** Quantos metros a mata entra nos limites do mapa. */
  readonly inner: number;
  /** Até onde a mata vai além dos limites, em metros. */
  readonly outer: number;
  /** Espaçamento médio entre árvores, em metros. */
  readonly spacing: number;
  /** Cores das copas (por instância); coníferas usam a última. */
  readonly colors: readonly number[];
  /** Fração de coníferas, de 0 a 1. */
  readonly coniferShare: number;
  /** Distância mínima da centerline, para a mata não fechar a pista. */
  readonly roadClearance: number;
  /** Multiplica o tamanho das árvores; maior quando a mata fica longe da pista. */
  readonly scale?: number;
  /** Áreas sem árvores (marcos de paisagem, água). */
  readonly exclude?: (x: number, z: number) => boolean;
}

const FAR_WIND: WindOptions = { strength: 0.12, from: 2, to: 5.5, speed: 1 };

/**
 * Mata contínua na borda do mapa e na saia do terreno: fecha o horizonte
 * que antes terminava num muro. Geometria facetada e sem sombra, pois fica
 * sempre a dezenas de metros da câmera.
 */
export function createForestBelt(track: TrackLike, options: ForestBeltOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = "forest-belt";
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const random = randomGenerator(options.seed);
  // Distância com sinal até a borda do mapa: negativa dentro, positiva fora.
  const edge = (x: number, z: number) => {
    const outside = Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minZ - z, 0, z - maxZ));
    return outside > 0 ? outside : -Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
  };
  const area = {
    minX: minX - options.outer, maxX: maxX + options.outer,
    minZ: minZ - options.outer, maxZ: maxZ + options.outer,
  };
  const points = scatterPoints(area, options.spacing, options.seed, (x, z) => {
    const distance = edge(x, z);
    if (distance < -options.inner || distance > options.outer) return 0;
    if (options.exclude?.(x, z)) return 0;
    if (pathDistance(track.path, x, z) < options.roadClearance) return 0;
    // Orla densa, rareando para fora, com clareiras de ruído.
    const thinning = 1 - 0.55 * Math.max(0, distance) / options.outer;
    const clearing = fractalNoise2D(x / 30, z / 30, options.seed + 3);
    return thinning * (clearing < 0.32 ? 0.15 : 0.95);
  });

  const broadleaf: THREE.Matrix4[] = [];
  const conifers: THREE.Matrix4[] = [];
  const broadColors: THREE.Color[] = [];
  const coniferColors: THREE.Color[] = [];
  const dummy = new THREE.Object3D();
  const crownColors = options.colors.map((hex) => new THREE.Color(hex));
  for (const point of points) {
    const conifer = random() < options.coniferShare;
    // Mais altas para fora: a mata sobe em degraus em direção às montanhas.
    const scale = (1.05 + random() * 0.6) * (1 + Math.max(0, edge(point.x, point.z)) / 90) *
      (options.scale ?? 1);
    dummy.position.set(point.x, (track.groundHeightAt?.(point.x, point.z) ?? 0) - 0.1, point.z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.scale.set(scale, scale * (0.9 + random() * 0.25), scale);
    dummy.updateMatrix();
    const color = conifer
      ? crownColors[crownColors.length - 1].clone()
      : crownColors[Math.floor(random() * Math.max(1, crownColors.length - 1))].clone();
    color.offsetHSL((random() - 0.5) * 0.02, 0, (random() - 0.5) * 0.05);
    (conifer ? conifers : broadleaf).push(dummy.matrix.clone());
    (conifer ? coniferColors : broadColors).push(color);
  }

  const material = celMaterial(0xffffff);
  material.vertexColors = true;
  applyWind(material, FAR_WIND);
  const batches: [THREE.BufferGeometry, THREE.Matrix4[], THREE.Color[], string][] = [
    [farTreeGeometry(), broadleaf, broadColors, "forest-broadleaf"],
    [farConiferGeometry(), conifers, coniferColors, "forest-conifers"],
  ];
  for (const [geometry, matrices, colors, name] of batches) {
    if (matrices.length === 0) continue;
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    mesh.name = name;
    matrices.forEach((matrix, index) => {
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, colors[index]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    mesh.computeBoundingSphere();
    const outline = createInstancedOutline(mesh, 0.75);
    applyWind(outline.material as THREE.Material, FAR_WIND);
    group.add(mesh, outline);
  }
  return group;
}
