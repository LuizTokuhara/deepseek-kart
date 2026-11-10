import * as THREE from "three";
import { COLORS } from "../../core/config";
import { outlinedMaterial } from "../../rendering/cel-shading";
import { glowColor } from "../../rendering/glow";
import { extrudedShape, latheZ, part, profileRadius, unlitMaterial } from "./parts";

/** Name of the exhaust flame, hidden while the missile is only held. */
export const MISSILE_FLAME = "missile-flame";

/** Height of the missile's axis above the ground. */
const AXIS_Y = 0.34;
/** Painted hull, tail to nose cap, as [radius, z]. */
const HULL: readonly (readonly [number, number])[] = [
  [0, -0.4], [0.1, -0.4], [0.128, -0.39], [0.146, -0.34], [0.158, -0.2], [0.164, -0.04],
  [0.162, 0.1], [0.152, 0.22], [0.132, 0.32], [0.104, 0.4], [0.076, 0.455],
];
/** Accent nose cap, continuing the hull to the tip. */
const NOSE: readonly (readonly [number, number])[] = [
  [0, 0.44], [0.079, 0.45], [0.066, 0.49], [0.046, 0.525], [0.024, 0.552], [0.008, 0.565], [0, 0.568],
];
const BANDS = [[-0.02, 0.05], [-0.32, -0.27]] as const;

const metal = outlinedMaterial(0x3a414d, 0.0012);
const ink = unlitMaterial(0x17202b);
const glint = unlitMaterial(0xfff8e8);
// The outer flame is see-through, so the hot core shows from the side too.
const flameOuter = Object.assign(unlitMaterial(glowColor(0xff8a2a, 2.2)), {
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
});
const flameInner = unlitMaterial(glowColor(0xffe6a0, 3));

/** A raised paint band that hugs the hull between `from` and `to` (z). */
function band(from: number, to: number): THREE.BufferGeometry {
  const lift = 0.006;
  return latheZ([
    [profileRadius(HULL, from) - 0.004, from],
    [profileRadius(HULL, from) + lift, from + 0.006],
    [profileRadius(HULL, to) + lift, to - 0.006],
    [profileRadius(HULL, to) - 0.004, to],
  ], 28);
}

/** Swept tail fin: root along the hull, tip raked back past the nozzle. */
function fin(angle: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.06);
  shape.quadraticCurveTo(0.1, -0.12, 0.16, -0.36);
  shape.lineTo(0.175, -0.47);
  shape.quadraticCurveTo(0.13, -0.43, 0.09, -0.42);
  shape.quadraticCurveTo(0.03, -0.39, 0, -0.33);
  shape.closePath();
  const geometry = extrudedShape(shape, 0.022, 0.011, false);
  // Shape x → radial (+Y), shape y → along the hull (+Z), thickness → X.
  geometry.applyMatrix4(new THREE.Matrix4().set(
    0, 0, 1, 0,
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  ));
  geometry.translate(0, 0.13, 0);
  geometry.rotateZ(angle);
  return geometry.translate(0, AXIS_Y, 0);
}

/** Cartoon eye on the hull side: dark oval plus a glint toward the nose. */
function eyes(): { pupils: THREE.BufferGeometry[]; glints: THREE.BufferGeometry[] } {
  const pupils: THREE.BufferGeometry[] = [];
  const glints: THREE.BufferGeometry[] = [];
  const z = 0.24;
  const radius = profileRadius(HULL, z);
  const fromTop = 0.95;
  for (const side of [-1, 1]) {
    const nx = Math.sin(fromTop) * side;
    const ny = Math.cos(fromTop);
    const tilt = side > 0 ? Math.PI / 2 - fromTop : Math.PI / 2 + fromTop;
    pupils.push(new THREE.SphereGeometry(0.05, 14, 10)
      .scale(0.3, 0.95, 1.2)
      .rotateZ(tilt)
      .translate(nx * radius, AXIS_Y + ny * radius, z));
    glints.push(new THREE.SphereGeometry(0.016, 8, 6)
      .translate(nx * (radius + 0.012), AXIS_Y + ny * (radius + 0.012) + 0.014, z + 0.02));
  }
  return { pupils, glints };
}

/**
 * Toy rocket: smooth ogive hull with an accent nose cap and bands, four swept
 * fins, cartoon eyes, a dark nozzle bell and a glowing flame. The nose points
 * to +Z so the projectile can face its velocity.
 */
export function missileModel(red: boolean): THREE.Group {
  const group = new THREE.Group();
  const paint = outlinedMaterial(red ? COLORS.redMissile : COLORS.missile, 0.0022);
  const detail = outlinedMaterial(red ? COLORS.redMissileDetail : COLORS.missileDetail, 0.0018);

  const lift = (geometry: THREE.BufferGeometry) => geometry.translate(0, AXIS_Y, 0);
  part(group, [lift(latheZ(HULL, 28))], paint);
  part(group, [
    lift(latheZ(NOSE, 28)),
    ...BANDS.map(([from, to]) => lift(band(from, to))),
    ...[0, 1, 2, 3].map((i) => fin(Math.PI / 4 + i * Math.PI / 2)),
  ], detail);
  // Nozzle bell, open toward the flame.
  part(group, [lift(latheZ([
    [0.07, -0.385], [0.098, -0.4], [0.112, -0.44], [0.124, -0.47], [0.108, -0.476],
    [0.088, -0.445], [0.066, -0.425], [0, -0.42],
  ], 20))], metal);
  const { pupils, glints } = eyes();
  part(group, pupils, ink, false);
  part(group, glints, glint, false);

  const flame = new THREE.Group();
  flame.name = MISSILE_FLAME;
  part(flame, [lift(latheZ([[0, -0.43], [0.095, -0.47], [0.085, -0.58], [0.045, -0.7], [0, -0.82]], 14))],
    flameOuter, false);
  part(flame, [lift(latheZ([[0, -0.44], [0.06, -0.47], [0.05, -0.55], [0.024, -0.63], [0, -0.68]], 12))],
    flameInner, false);
  group.add(flame);
  return group;
}
