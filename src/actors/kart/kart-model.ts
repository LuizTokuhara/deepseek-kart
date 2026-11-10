import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { COLORS, KART_WHEEL_CONTACTS } from "../../core/config";
import { kartCelMaterial as celMaterial, maskKartSurface, INK_THICKNESS } from "../../rendering/cel-shading";
import { KartShadow } from "./kart-shadow";
import { clamp, damp } from "../../core/math";
import type { KartTrack } from "./kart";
import type { KartState } from "../../core/types";

export interface KartPalette {
  body: number;
  accent: number;
  trim: number;
  number: string;
}

export const PLAYER_PALETTE: KartPalette = {
  body: COLORS.kart,
  accent: 0x22d3ee,
  trim: COLORS.kartNose,
  number: "01",
};

export const AI_PALETTE: KartPalette = {
  body: COLORS.aiKart,
  accent: 0xbe123c,
  trim: 0xf8fafc,
  number: "02",
};

/** Distinct liveries keep every rival readable on track, HUD and minimap. */
export const AI_PALETTES: readonly KartPalette[] = [
  AI_PALETTE,
  {
    body: 0x2fbf71,
    accent: 0x15803d,
    trim: 0xf8fafc,
    number: "03",
  },
  {
    body: 0x8b5cf6,
    accent: 0x6d28d9,
    trim: 0xf8fafc,
    number: "04",
  },
  {
    body: 0xf59e0b,
    accent: 0xb45309,
    trim: 0xf8fafc,
    number: "05",
  },
];

const TIRE_MATERIAL = celMaterial(COLORS.kartWheel, 0.0025);
const RIM_MATERIAL = celMaterial(0xe2e8f0, 0.0015);
const DARK_MATERIAL = celMaterial(0x192337, 0.0015);
const TREAD_MATERIAL = celMaterial(0x1b2130);

const NUMBER_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x07111f });
NUMBER_MATERIAL.userData.outlineParameters = { visible: false };

const GAUGE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
GAUGE_MATERIAL.userData.outlineParameters = { visible: false };

const toon = (color: number): ReturnType<typeof celMaterial> =>
  celMaterial(color, INK_THICKNESS);

function ellipsoid(
  radiusX: number,
  radiusY: number,
  radiusZ: number,
  widthSegments = 16,
  heightSegments = 10,
): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(
    1,
    widthSegments,
    heightSegments,
  );
  geometry.scale(radiusX, radiusY, radiusZ);
  return geometry;
}

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotationX, rotationY, rotationZ);
  parent.add(mesh);
  return mesh;
}

function addSegment(
  parent: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  radialSegments = 6,
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, radialSegments),
    material,
  );
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  parent.add(mesh);
  return mesh;
}

function bendWingGeometry(
  width: number,
  height: number,
  depth: number,
  span = width,
  lift = 0.16,
): THREE.BufferGeometry {
  // Subdivide across the whole span so the center really dips below the tips.
  // A rounded box only has vertices around its bevels and cannot form this arc.
  const positions: number[] = [];
  const indices: number[] = [];
  const stations = 40;
  const sides = 24;
  const edgeRadius = Math.min(height * 0.45, depth * 0.15);
  const roundedEnds = width === span;
  for (let station = 0; station <= stations; station++) {
    const x = Math.sin((station / stations - 0.5) * Math.PI) * width / 2;
    const t = x / (span / 2);
    const bevel = Math.max(0, Math.abs(x) - (width / 2 - edgeRadius)) / edgeRadius;
    const scale = roundedEnds ? Math.sqrt(Math.max(0.000001, 1 - bevel * bevel)) : 1;
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      positions.push(x,
        Math.sign(c) * Math.sqrt(Math.abs(c)) * height / 2 * scale + lift * t * t,
        Math.sign(s) * Math.sqrt(Math.abs(s)) * depth / 2 * scale - 0.06 * t * t);
      if (station > 0) {
        const a = (station - 1) * sides + side;
        const b = (station - 1) * sides + (side + 1) % sides;
        const c = station * sides + side;
        const d = station * sides + (side + 1) % sides;
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  for (const station of [0, stations]) {
    const center = positions.length / 3;
    const x = (station / stations - 0.5) * width;
    const t = x / (span / 2);
    positions.push(x, lift * t * t, -0.06 * t * t);
    for (let side = 0; side < sides; side++) {
      const a = station * sides + side;
      const b = station * sides + (side + 1) % sides;
      if (station === 0) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function noseProfile(t: number): { width: number; center: number; height: number } {
  const tip = Math.sqrt(Math.max(0, 1 - t ** 12));
  return {
    width: 0.34 * (1 - 0.64 * t) * tip,
    center: 0.48 - 0.25 * t,
    height: 0.23 * (1 - 0.7 * t) * tip,
  };
}

function noseTop(x: number, z: number): number {
  const { width, center, height } = noseProfile(clamp((z - 0.22) / 0.99, 0, 0.999));
  return center + height * Math.sqrt(Math.max(0, 1 - (x / width) ** 2));
}

/** A separate tapered nose leaves the seat and footwell open. */
function createNoseGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = 32;
  const sides = 24;
  for (let ring = 0; ring < rings; ring++) {
    const t = ring / rings;
    const { width, center, height } = noseProfile(t);
    for (let side = 0; side < sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      positions.push(width * Math.sin(angle), center + height * Math.cos(angle), 0.22 + t * 0.99);
      if (ring > 0) {
        const a = (ring - 1) * sides + side;
        const b = (ring - 1) * sides + (side + 1) % sides;
        const c = ring * sides + side;
        const d = ring * sides + (side + 1) % sides;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const rear = positions.length / 3;
  positions.push(0, 0.48, 0.22);
  const tip = positions.length / 3;
  positions.push(0, 0.23, 1.21);
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    indices.push(rear, side, next);
    indices.push(tip, (rings - 1) * sides + next, (rings - 1) * sides + side);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A single conforming ribbon, including the wider number field. */
function createNoseStripe(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const rows = 40;
  const columns = 8;
  for (let row = 0; row <= rows; row++) {
    const t = 0.01 + (row / rows) * 0.975;
    const z = 0.22 + 0.99 * t;
    const halfWidth = Math.min(noseProfile(t).width * 0.8,
      0.075 + 0.06 * Math.exp(-(((t - 0.74) / 0.14) ** 4)));
    for (let column = 0; column <= columns; column++) {
      const x = (column / columns * 2 - 1) * halfWidth;
      positions.push(x, noseTop(x, z) + 0.003, z);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column;
        const b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function conformNumber(
  text: string,
  centerZ: number,
  top: (x: number, z: number) => number,
): THREE.BufferGeometry {
  const geometry = createNumberGeometry(text);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i) + centerZ;
    position.setXYZ(i, x, top(x, z) + position.getY(i) + 0.006, z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const DIGIT_SEGMENTS: Record<string, number[]> = {
  "0": [1, 2, 3, 4, 5, 6],
  "1": [3, 5],
  "2": [1, 3, 7, 4, 6],
  "3": [1, 3, 7, 5, 6],
  "4": [2, 3, 7, 5],
  "5": [1, 2, 7, 5, 6],
  "6": [1, 2, 7, 4, 5, 6],
  "7": [1, 3, 5],
  "8": [1, 2, 3, 4, 5, 6, 7],
  "9": [1, 2, 3, 7, 5, 6],
};

function createNumberGeometry(text: string): THREE.BufferGeometry {
  const digitWidth = 0.075;
  const digitHeight = 0.13;
  const stroke = 0.014;
  const gap = 0.03;
  const depth = 0.006;
  const totalWidth =
    text.length * digitWidth + Math.max(0, text.length - 1) * gap;
  const startX = -totalWidth / 2 + digitWidth / 2;
  const geometries: THREE.BufferGeometry[] = [];

  const addBar = (
    x: number,
    z: number,
    width: number,
    length: number,
  ): void => {
    const geometry = new THREE.BoxGeometry(width, depth, length);
    geometry.translate(x, 0, z);
    geometries.push(geometry);
  };

  for (let index = 0; index < text.length; index++) {
    const pattern = DIGIT_SEGMENTS[text[index]];
    if (!pattern) {
      continue;
    }

    const centerX = startX + index * (digitWidth + gap);
    const halfW = digitWidth / 2;
    const halfH = digitHeight / 2;

    for (const segment of pattern) {
      if (segment === 1) {
        addBar(centerX, -halfH, digitWidth - stroke, stroke);
      } else if (segment === 6) {
        addBar(centerX, halfH, digitWidth - stroke, stroke);
      } else if (segment === 7) {
        addBar(centerX, 0, digitWidth - stroke, stroke);
      } else if (segment === 2) {
        addBar(centerX - halfW, -halfH / 2, stroke, halfH - stroke);
      } else if (segment === 3) {
        addBar(centerX + halfW, -halfH / 2, stroke, halfH - stroke);
      } else if (segment === 4) {
        addBar(centerX - halfW, halfH / 2, stroke, halfH - stroke);
      } else if (segment === 5) {
        addBar(centerX + halfW, halfH / 2, stroke, halfH - stroke);
      }
    }
  }

  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) {
    geometry.dispose();
  }

  if (!merged) {
    throw new Error("Falha ao gerar a geometria do número do kart");
  }
  return merged;
}

function createWheel(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  radius: number,
  width: number,
  rimRadius: number,
  hubRadius: number,
  hubMaterial: THREE.Material,
): WheelRig {
  const steer = new THREE.Group();
  steer.position.set(x, y, z);
  parent.add(steer);
  const spin = new THREE.Group();
  steer.add(spin);

  // Broad tread with rounded shoulders, rather than a narrow torus.
  const half = width / 2;
  const profile = [
    [rimRadius, -half + 0.025],
    [radius - 0.065, -half],
    [radius - 0.018, -half + 0.025],
    [radius, -half + 0.065],
    [radius, half - 0.065],
    [radius - 0.018, half - 0.025],
    [radius - 0.065, half],
    [rimRadius, half - 0.025],
    [rimRadius, -half + 0.025],
  ].map(([r, axial]) => new THREE.Vector2(r, axial));
  addMesh(spin, new THREE.LatheGeometry(profile, 24), TIRE_MATERIAL,
    0, 0, 0, 0, 0, Math.PI / 2);

  const treads: THREE.BufferGeometry[] = [];
  for (let step = 0; step < 28; step++) {
    const angle = step / 28 * Math.PI * 2;
    for (const side of [-1, 1]) {
      const tread = new THREE.BoxGeometry(width * 0.34, 0.007, 0.014);
      tread.rotateY(side * 0.25);
      tread.translate(side * width * 0.18, radius - 0.001, 0);
      tread.rotateX(angle);
      treads.push(tread);
    }
  }
  const treadGeometry = mergeGeometries(treads, false);
  for (const geometry of treads) geometry.dispose();
  if (treadGeometry) addMesh(spin, treadGeometry, TREAD_MATERIAL, 0, 0, 0);

  const side = Math.sign(x) || 1;
  const outerX = side * (half - 0.025);
  // Dark recessed dish, thin silver lip and a body-colored central hub.
  addMesh(spin, new THREE.CylinderGeometry(rimRadius, rimRadius, 0.012, 24),
    DARK_MATERIAL, outerX, 0, 0, 0, 0, Math.PI / 2);
  addMesh(spin, new THREE.TorusGeometry(rimRadius - 0.008, 0.017, 6, 24),
    RIM_MATERIAL, outerX + side * 0.008, 0, 0, 0, Math.PI / 2);
  addMesh(spin, new THREE.CylinderGeometry(hubRadius, hubRadius, 0.04, 16),
    hubMaterial, outerX + side * 0.012, 0, 0, 0, 0, Math.PI / 2);

  const boltX = outerX + side * 0.038;
  addMesh(spin, new THREE.BoxGeometry(0.008, hubRadius * 1.1, 0.016),
    DARK_MATERIAL, boltX, 0, 0);
  addMesh(spin, new THREE.BoxGeometry(0.008, 0.016, hubRadius * 1.1),
    DARK_MATERIAL, boltX, 0, 0);
  return { steer, spin };
}

interface WheelRig {
  steer: THREE.Group;
  spin: THREE.Group;
}

interface KartParts {
  suspension: THREE.Group;
  body: THREE.Group;
  steeringWheel: THREE.Group;
  frontSteer: THREE.Group[];
  frontSpin: THREE.Group[];
  rearSpin: THREE.Group[];
  rearSteer: THREE.Group[];
  brakeMaterial: THREE.MeshBasicMaterial;
  shadow: KartShadow;
}

function buildKart(root: THREE.Group, palette: KartPalette): KartParts {
  const bodyMaterial = toon(palette.body);
  const trimMaterial = toon(palette.trim);
  const stripeMaterial = new THREE.MeshBasicMaterial({ color: palette.trim });
  stripeMaterial.userData.outlineParameters = { visible: false };
  const brakeMaterial = new THREE.MeshBasicMaterial({ color: 0x7f1d1d });
  brakeMaterial.userData.outlineParameters = { visible: false };

  const suspension = new THREE.Group();
  suspension.position.y = 0.28;
  root.add(suspension);
  const body = new THREE.Group();
  body.position.y = -0.28;
  suspension.add(body);

  // Slim nose and low chassis leave an actual open cockpit between axles.
  const nose = addMesh(body, createNoseGeometry(), bodyMaterial, 0, 0, 0);
  nose.name = "nose";
  addMesh(body, createNoseStripe(), stripeMaterial, 0, 0, 0);
  addMesh(body, conformNumber(palette.number, 0.95, noseTop), NUMBER_MATERIAL, 0, 0, 0);
  addMesh(body, new RoundedBoxGeometry(0.64, 0.065, 1.25, 3, 0.03),
    DARK_MATERIAL, 0, 0.18, -0.08);
  for (const side of [-1, 1]) {
    addMesh(body, new RoundedBoxGeometry(0.24, 0.11, 0.55, 4, 0.05),
      bodyMaterial, side * 0.4, 0.22, 0.28);
    // Exposed axles and short frame rails.
    addSegment(body, new THREE.Vector3(side * 0.2, 0.25, -0.45),
      new THREE.Vector3(side * 0.2, 0.25, 0.38), 0.035, DARK_MATERIAL);
  }
  addSegment(body, new THREE.Vector3(-0.66, 0.32, 0.73),
    new THREE.Vector3(0.66, 0.32, 0.73), 0.055, bodyMaterial);
  addSegment(body, new THREE.Vector3(-0.73, 0.42, -0.7),
    new THREE.Vector3(0.73, 0.42, -0.7), 0.07, bodyMaterial);
  const splitter = addMesh(body, bendWingGeometry(1.22, 0.10, 0.24, 1.22, 0.055),
    bodyMaterial, 0, 0.15, 1.08);
  splitter.name = "front-splitter";
  addMesh(body, new RoundedBoxGeometry(1.05, 0.04, 0.2, 3, 0.018),
    DARK_MATERIAL, 0, 0.095, 1.06);

  // Compact rear engine with seven recessed grille slots.
  addMesh(body, ellipsoid(0.34, 0.25, 0.35, 24, 16),
    bodyMaterial, 0, 0.43, -0.74);
  for (let index = 0; index < 7; index++) {
    const x = (index - 3) * 0.065;
    const backZ = -0.74 - 0.35 * Math.sqrt(1 - (x / 0.34) ** 2);
    addMesh(body, new RoundedBoxGeometry(0.024, 0.2, 0.018, 2, 0.008),
      DARK_MATERIAL, x, 0.42, backZ);
  }
  addMesh(body, new RoundedBoxGeometry(0.6, 0.10, 0.14, 3, 0.04),
    bodyMaterial, 0, 0.2, -1.08);
  for (const side of [-1, 1]) {
    addMesh(body, new THREE.BoxGeometry(0.09, 0.026, 0.012),
      brakeMaterial, side * 0.2, 0.2, -1.155);
  }

  // Tapered black tubes end in rounded, hollow body-colored cowls.
  const cowlProfile = [
    [0.15, -0.45], [0.21, -0.45], [0.25, -0.41],
    [0.265, -0.32], [0.25, -0.21], [0.21, -0.13],
    [0.17, -0.15], [0.15, -0.25], [0.15, -0.45],
  ].map(([r, axial]) => new THREE.Vector2(r, axial));
  for (const side of [-1, 1]) {
    const pod = new THREE.Group();
    pod.name = "rear-pod";
    pod.position.set(side * 0.35, 0.78, -0.76);
    pod.rotation.set(0.34, side * -0.14, 0);
    body.add(pod);
    addMesh(pod, new THREE.CylinderGeometry(0.13, 0.22, 0.62, 24),
      DARK_MATERIAL, 0, 0, 0.05, Math.PI / 2);
    addMesh(pod, new THREE.LatheGeometry(cowlProfile, 24),
      bodyMaterial, 0, 0, 0, Math.PI / 2);
    addMesh(pod, new THREE.CylinderGeometry(0.15, 0.15, 0.012, 20),
      DARK_MATERIAL, 0, 0, -0.32, Math.PI / 2);
  }

  // Bucket seat, visible footwell and a dashboard behind the nose.
  addMesh(body, new RoundedBoxGeometry(0.43, 0.09, 0.48, 4, 0.04),
    DARK_MATERIAL, 0, 0.32, -0.18);
  const backrest = new RoundedBoxGeometry(0.48, 0.51, 0.14, 5, 0.065);
  const seatPosition = backrest.getAttribute("position");
  for (let index = 0; index < seatPosition.count; index++) {
    const y = seatPosition.getY(index);
    const waist = 1 - 0.18 * Math.exp(-(((y + 0.08) / 0.16) ** 2));
    seatPosition.setX(index, seatPosition.getX(index) * waist);
  }
  backrest.computeVertexNormals();
  addMesh(body, backrest, DARK_MATERIAL, 0, 0.61, -0.45, -0.18);
  for (const side of [-1, 1]) {
    addMesh(body, ellipsoid(0.045, 0.10, 0.23), DARK_MATERIAL,
      side * 0.2, 0.4, -0.17);
  }
  addMesh(body, new RoundedBoxGeometry(0.5, 0.2, 0.075, 4, 0.035),
    bodyMaterial, 0, 0.59, 0.225);
  for (const side of [-1, 1]) {
    addMesh(body, new THREE.CylinderGeometry(0.035, 0.035, 0.01, 16),
      GAUGE_MATERIAL, side * 0.09, 0.63, 0.18, Math.PI / 2);
  }
  // The column rises from the dashboard back toward the seat, and the wheel
  // faces the driver: its rim leans forward at the top, square to the column.
  const steeringHub = new THREE.Vector3(0, 0.8, 0.07);
  const steeringRake = 0.6;
  const columnDirection = new THREE.Vector3(0, -Math.sin(steeringRake), Math.cos(steeringRake));
  addSegment(body, steeringHub.clone().addScaledVector(columnDirection, 0.45),
    steeringHub, 0.025, DARK_MATERIAL);
  const steeringTilt = new THREE.Group();
  steeringTilt.position.copy(steeringHub);
  steeringTilt.rotation.x = steeringRake;
  body.add(steeringTilt);
  const steeringWheel = new THREE.Group();
  steeringTilt.add(steeringWheel);
  addMesh(steeringWheel, new THREE.TorusGeometry(0.145, 0.025, 8, 20),
    bodyMaterial, 0, 0, 0);
  for (let index = 0; index < 3; index++) {
    addMesh(steeringWheel, new THREE.BoxGeometry(0.016, 0.125, 0.014),
      RIM_MATERIAL, 0, 0, 0, 0, 0, index / 3 * Math.PI);
  }
  addMesh(steeringWheel, new THREE.SphereGeometry(0.033, 10, 6),
    DARK_MATERIAL, 0, 0, 0);
  // Small gear lever alongside the seat.
  addSegment(body, new THREE.Vector3(0.26, 0.24, -0.06),
    new THREE.Vector3(0.29, 0.53, 0.02), 0.012, DARK_MATERIAL);
  addMesh(body, ellipsoid(0.035, 0.055, 0.035), bodyMaterial, 0.29, 0.54, 0.02);

  // Thick cambered wing with raised tips and a stripe wrapped over its skin.
  const wingWidth = 1.72;
  const wingY = 1.2;
  const wingZ = -1.1;
  const wing = addMesh(body, bendWingGeometry(wingWidth, 0.16, 0.39),
    bodyMaterial, 0, wingY, wingZ);
  wing.name = "rear-wing";
  for (const side of [-1, 1]) {
    addSegment(body, new THREE.Vector3(side * 0.25, 0.52, -0.74),
      new THREE.Vector3(side * 0.25, 1.16, wingZ), 0.034, bodyMaterial, 10);
  }
  addMesh(body, bendWingGeometry(0.42, 0.164, 0.394, wingWidth),
    trimMaterial, 0, wingY, wingZ);
  addMesh(body, conformNumber(palette.number, wingZ,
    (x, z) => {
      const t = x / (wingWidth / 2);
      const cross = (z - wingZ + 0.06 * t * t) / 0.197;
      return wingY + 0.16 * t * t + 0.082 * (1 - cross ** 4) ** 0.25;
    }),
    NUMBER_MATERIAL, 0, 0, 0);

  const frontSteer: THREE.Group[] = [];
  const frontSpin: THREE.Group[] = [];
  const rearSpin: THREE.Group[] = [];
  const rearSteer: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const front = createWheel(root, side * 0.65, 0.32, 0.73,
      0.32, 0.32, 0.18, 0.075, bodyMaterial);
    frontSteer.push(front.steer);
    frontSpin.push(front.spin);
    const rear = createWheel(root, side * 0.73, 0.42, -0.7,
      0.42, 0.44, 0.25, 0.1, bodyMaterial);
    rearSpin.push(rear.spin);
    rearSteer.push(rear.steer);
    front.steer.name = `front-wheel-${side > 0 ? "left" : "right"}`;
    rear.steer.name = `rear-wheel-${side > 0 ? "left" : "right"}`;
  }

  // Decals, gauges and tread also protect their pixels from the exterior ink.
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach(maskKartSurface);
  });

  const shadow = new KartShadow();
  root.add(shadow);

  return {
    suspension, body, steeringWheel, frontSteer, frontSpin, rearSpin, rearSteer,
    brakeMaterial, shadow,
  };
}

export class KartModel {
  readonly group = new THREE.Group();

  private readonly parts: KartParts;
  private readonly frontRadius = 0.32;
  private readonly rearRadius = 0.42;
  private previousForward = 0;
  private frontAngle = 0;
  private rearAngle = 0;
  private elapsed = 0;
  private compression = 0;
  private compressionVelocity = 0;
  private readonly wheelWorld = new THREE.Vector3();
  private readonly groundRotation = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly groundQuaternion = new THREE.Quaternion();

  constructor(palette: KartPalette) {
    this.parts = buildKart(this.group, palette);
    this.reset();
  }

  get body(): THREE.Group {
    return this.parts.body;
  }

  get wheelAngle(): number {
    return this.frontAngle;
  }

  get bodyRoll(): number {
    return this.parts.suspension.rotation.z;
  }

  get suspensionOffset(): number {
    return this.compression;
  }

  /** Visual impulse received on the exact landing tick, independent of rendering. */
  land(impactSpeed: number): void {
    if (impactSpeed <= 0) return;
    this.compressionVelocity -= clamp(impactSpeed * 0.22, 0, 1.8);
  }

  reset(): void {
    this.previousForward = 0;
    this.frontAngle = 0;
    this.rearAngle = 0;
    this.elapsed = 0;
    this.compression = 0;
    this.compressionVelocity = 0;
    for (const wheel of this.parts.frontSteer) wheel.position.y = this.frontRadius;
    for (const wheel of this.parts.rearSteer) wheel.position.y = this.rearRadius;

    this.parts.suspension.rotation.set(0, 0, 0);
    this.parts.suspension.position.y = 0.28;
    this.parts.steeringWheel.rotation.z = 0;

    for (const steer of this.parts.frontSteer) {
      steer.rotation.y = 0;
    }
    for (const spin of this.parts.frontSpin) {
      spin.rotation.x = 0;
    }
    for (const spin of this.parts.rearSpin) {
      spin.rotation.x = 0;
    }

    this.parts.brakeMaterial.color.setHex(0x7f1d1d);
    this.parts.shadow.reset();
  }

  update(dt: number, state: KartState, terrain?: Pick<KartTrack, "heightAt" | "holeAt">): void {
    const step = clamp(dt, 0, 0.05);
    this.elapsed += step;

    const acceleration =
      step > 0 ? (state.vForward - this.previousForward) / step : 0;
    this.previousForward = state.vForward;

    const speedRatio = clamp(Math.abs(state.vForward) / 22, 0, 1);
    const targetRoll = clamp(
      state.steer * 0.1 +
        state.vLateral * 0.005 +
        (state.drifting ? state.driftDirection * 0.035 : 0),
      -0.18,
      0.18,
    );
    const targetPitch =
      clamp(-acceleration * 0.0055, -0.08, 0.08) +
      (state.miniTurboTimer > 0 ? -0.025 : 0);

    this.parts.suspension.rotation.z = damp(
      this.parts.suspension.rotation.z,
      targetRoll,
      8,
      step,
    );
    this.parts.suspension.rotation.x = damp(
      this.parts.suspension.rotation.x,
      targetPitch,
      7,
      step,
    );

    // Substeps keep the damper stable on 30/60/120 Hz displays.
    const steps = Math.max(1, Math.ceil(step * 120));
    const springDt = step / steps;
    const rest = state.grounded || state.falling ? 0 : 0.035;
    for (let i = 0; i < steps; i++) {
      this.compressionVelocity += (-150 * (this.compression - rest) - 14 * this.compressionVelocity) * springDt;
      this.compression = clamp(this.compression + this.compressionVelocity * springDt, -0.16, 0.09);
    }
    const bob = state.grounded ? Math.sin(this.elapsed * 18) * 0.003 * speedRatio : 0;
    this.parts.suspension.position.y = 0.28 + this.compression + bob;
    this.updateWheelContact(step, state, terrain);

    this.parts.steeringWheel.rotation.z = damp(
      this.parts.steeringWheel.rotation.z,
      -state.steer * 0.85,
      12,
      step,
    );

    for (const steer of this.parts.frontSteer) {
      steer.rotation.y = damp(
        steer.rotation.y,
        state.steer * 0.48,
        14,
        step,
      );
    }

    this.frontAngle =
      (this.frontAngle + (state.vForward / this.frontRadius) * step) %
      (Math.PI * 2);
    this.rearAngle =
      (this.rearAngle + (state.vForward / this.rearRadius) * step) %
      (Math.PI * 2);

    for (const spin of this.parts.frontSpin) {
      spin.rotation.x = this.frontAngle;
    }
    for (const spin of this.parts.rearSpin) {
      spin.rotation.x = this.rearAngle;
    }

    const braking = acceleration < -4 && state.vForward > 1;
    this.parts.brakeMaterial.color.setHex(braking ? 0xff4d5e : 0x7f1d1d);

    this.parts.shadow.update(state, this.group, terrain);
  }

  private updateWheelContact(dt: number, state: KartState, terrain?: Pick<KartTrack, "heightAt" | "holeAt">): void {
    this.groundRotation.set(state.groundPitch, state.yaw, state.groundRoll);
    this.groundQuaternion.setFromEuler(this.groundRotation);
    const up = Math.max(0.4, Math.cos(state.groundPitch) * Math.cos(state.groundRoll));
    for (let i = 0; i < KART_WHEEL_CONTACTS.length; i++) {
      const wheel = i < 2 ? this.parts.frontSteer[i] : this.parts.rearSteer[i - 2];
      const radius = i < 2 ? this.frontRadius : this.rearRadius;
      let offset = state.grounded ? 0 : -0.1;
      if (state.grounded && terrain?.heightAt) {
        const contact = KART_WHEEL_CONTACTS[i];
        this.wheelWorld.set(contact.x, radius, contact.z).applyQuaternion(this.groundQuaternion);
        const x = state.pos.x + this.wheelWorld.x;
        const z = state.pos.z + this.wheelWorld.z;
        offset = terrain.holeAt?.(x, z) ? -0.12 : clamp(
          (terrain.heightAt(x, z, state.height) + radius - state.height - this.wheelWorld.y) / up,
          -0.2, 0.18,
        );
      }
      // On the ground, immediate contact; in the air, smooth damper extension.
      wheel.position.y = state.grounded ? radius + offset : damp(wheel.position.y, radius + offset, 12, dt);
    }
  }
}
