import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { randomGenerator } from "../common";

/** Triângulos soltos com normal para cima: iluminados como o chão em volta. */
function flatShadedGeometry(positions: number[], colors: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const normals = new Float32Array(positions.length);
  for (let index = 1; index < normals.length; index += 3) normals[index] = 1;
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return geometry;
}

/**
 * Tufo de folhas finas em leque. A base tem a cor do chão e a ponta é mais
 * clara, então o tufo nasce do terreno sem contorno visível.
 */
export function grassTuftGeometry(base: number, tip: number, blades = 6): THREE.BufferGeometry {
  const random = randomGenerator(9187);
  const baseColor = new THREE.Color(base);
  const tipColor = new THREE.Color(tip);
  const positions: number[] = [];
  const colors: number[] = [];
  for (let blade = 0; blade < blades; blade++) {
    const angle = (blade / blades) * Math.PI * 2 + random() * 0.8;
    const radius = 0.03 + random() * 0.08;
    const height = 0.28 + random() * 0.24;
    const lean = 0.06 + random() * 0.14;
    const halfWidth = 0.032 + random() * 0.014;
    const outX = Math.cos(angle);
    const outZ = Math.sin(angle);
    const x = outX * radius;
    const z = outZ * radius;
    // Largura perpendicular à inclinação: a folha abre em leque.
    positions.push(
      x - outZ * halfWidth, 0, z + outX * halfWidth,
      x + outZ * halfWidth, 0, z - outX * halfWidth,
      x + outX * lean, height, z + outZ * lean,
    );
    colors.push(...baseColor.toArray(), ...baseColor.toArray(), ...tipColor.toArray());
  }
  return flatShadedGeometry(positions, colors);
}

/**
 * Flor de caule fino: cinco pétalas brancas (tingidas por instância), miolo
 * amarelo e caule verde-escuro, que continua escuro com qualquer tinta.
 */
export function flowerGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const petal = [1, 1, 1];
  const heart = [1, 0.84, 0.32];
  const stem = [0.24, 0.42, 0.2];
  const y = 0.28;
  for (const angle of [0, Math.PI / 2]) {
    const dx = Math.cos(angle) * 0.012;
    const dz = Math.sin(angle) * 0.012;
    positions.push(-dx, 0, -dz, dx, 0, dz, 0, y, 0);
    colors.push(...stem, ...stem, ...stem);
  }
  for (let index = 0; index < 5; index++) {
    const a = (index / 5) * Math.PI * 2;
    const left = a - 0.45;
    const right = a + 0.45;
    positions.push(
      Math.cos(a) * 0.03, y, Math.sin(a) * 0.03,
      Math.cos(right) * 0.115, y + 0.03, Math.sin(right) * 0.115,
      Math.cos(left) * 0.115, y + 0.03, Math.sin(left) * 0.115,
    );
    colors.push(...petal, ...petal, ...petal);
    const next = a + (Math.PI * 2) / 5;
    positions.push(
      0, y + 0.014, 0,
      Math.cos(next) * 0.036, y + 0.01, Math.sin(next) * 0.036,
      Math.cos(a) * 0.036, y + 0.01, Math.sin(a) * 0.036,
    );
    colors.push(...heart, ...heart, ...heart);
  }
  return flatShadedGeometry(positions, colors);
}

/** Pedra achatada e facetada, meio enterrada. */
export function pebbleGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  geometry.scale(1, 0.55, 0.8);
  geometry.translate(0, 0.18, 0);
  return geometry;
}

/** Lóbulos sobrepostos, claros em cima e escuros embaixo, como as copas. */
function lobedCrown(
  lobes: readonly (readonly [number, number, number, number, number])[],
  detail: number,
  colors: { readonly top: number; readonly middle: number; readonly bottom: number },
): THREE.BufferGeometry {
  const parts = lobes.map(([x, y, z, width, height], index) => {
    const geometry = new THREE.IcosahedronGeometry(1, detail);
    geometry.rotateY(index * 0.91);
    geometry.scale(width, height, width * 0.9);
    geometry.translate(x, y, z);
    const position = geometry.getAttribute("position");
    const values: number[] = [];
    for (let vertex = 0; vertex < position.count; vertex++) {
      const upper = (position.getY(vertex) - y) / height;
      const hex = upper > 0.35 ? colors.top : upper < -0.35 ? colors.bottom : colors.middle;
      values.push(...new THREE.Color(hex).toArray());
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
    return geometry;
  });
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((part) => part.dispose());
  return merged;
}

const LEAF_TONES = { top: 0xd5df9a, middle: 0xb3c88c, bottom: 0x819c75 };

/** Arbusto baixo de três lóbulos, com ~1 m de raio e ~1 m de altura. */
export function bushGeometry(): THREE.BufferGeometry {
  return lobedCrown([
    [0, 0.55, 0, 0.95, 0.7],
    [-0.7, 0.4, 0.25, 0.7, 0.5],
    [0.65, 0.42, -0.2, 0.72, 0.55],
  ], 1, LEAF_TONES);
}

/** Árvore distante e barata: copa facetada e tronco no mesmo desenho. */
export function farTreeGeometry(): THREE.BufferGeometry {
  const crown = lobedCrown([
    [0, 3.5, 0, 1.6, 1.5],
    [-0.9, 2.9, 0.3, 1.2, 1.1],
    [0.85, 3.05, -0.25, 1.25, 1.15],
  ], 0, LEAF_TONES);
  return withTrunk(crown, 2.4);
}

/** Conífera distante: três cones empilhados, para variar a silhueta da mata. */
export function farConiferGeometry(): THREE.BufferGeometry {
  const parts = [[2.2, 1.7, 2.6], [3.4, 1.35, 2.2], [4.5, 0.95, 1.8]].map(([y, radius, height]) => {
    const cone = new THREE.ConeGeometry(radius, height, 7, 1, true);
    cone.translate(0, y, 0);
    const position = cone.getAttribute("position");
    const values: number[] = [];
    for (let vertex = 0; vertex < position.count; vertex++) {
      const upper = (position.getY(vertex) - y) / height;
      values.push(...new THREE.Color(upper > 0.2 ? 0x9fbd84 : 0x6f8f68).toArray());
    }
    cone.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
    return cone.toNonIndexed();
  });
  const crown = mergeGeometries(parts, false)!;
  parts.forEach((part) => part.dispose());
  return withTrunk(crown, 1.6);
}

function withTrunk(crown: THREE.BufferGeometry, height: number): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.2, 0.3, height, 5, 1, true).toNonIndexed();
  trunk.translate(0, height / 2, 0);
  const brown = new THREE.Color(0x88613e).toArray();
  const values: number[] = [];
  const count = trunk.getAttribute("position").count;
  for (let vertex = 0; vertex < count; vertex++) values.push(...brown);
  trunk.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
  trunk.deleteAttribute("uv");
  const flatCrown = crown.index ? crown.toNonIndexed() : crown;
  flatCrown.deleteAttribute("uv");
  const merged = mergeGeometries([trunk, flatCrown], false)!;
  trunk.dispose();
  flatCrown.dispose();
  return merged;
}
