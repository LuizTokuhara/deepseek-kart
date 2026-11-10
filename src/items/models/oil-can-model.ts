import * as THREE from "three";
import { COLORS } from "../../core/config";
import { outlinedMaterial } from "../../rendering/cel-shading";
import { dropShape, extrudedShape, lathe, part, taperedRod, tube, unlitMaterial } from "./parts";

const paint = outlinedMaterial(COLORS.oilCan, 0.002);
const metal = outlinedMaterial(0x313844, 0.0014);
const label = outlinedMaterial(0xfff3d4, 0.001);
const oil = outlinedMaterial(0x1d1712, 0.0008);
const ink = unlitMaterial(0x17202b);
const glint = unlitMaterial(0xfff8e8);

/** Where the spout leaves the cone and which way it points (toward +X). */
const SPOUT_BASE = new THREE.Vector3(0, 0.47, 0);
const SPOUT_DIRECTION = new THREE.Vector3(0.62, 0.78, 0).normalize();
const SPOUT_LENGTH = 0.36;

/**
 * Workshop oiler: yellow drum with rolled rims, a cream label stamped with an
 * oil drop, a conical top with a dark collar, a long tapered spout with a drip about to
 * fall and a side handle. It stands on y = 0, spout toward +X, label on ±Z.
 */
export function oilCanModel(): THREE.Group {
  const group = new THREE.Group();
  part(group, [
    lathe([
      [0, 0.045], [0.165, 0.045], [0.17, 0.07], [0.167, 0.2], [0.162, 0.32], [0.156, 0.336],
    ], 24),
    lathe([[0.152, 0.336], [0.146, 0.36], [0.104, 0.414], [0.064, 0.448], [0.05, 0.456]], 24),
  ], paint);
  part(group, [lathe([
    [0.164, 0.138], [0.174, 0.144], [0.172, 0.236], [0.162, 0.242],
  ], 24)], label);

  const tip = SPOUT_BASE.clone().addScaledVector(SPOUT_DIRECTION, SPOUT_LENGTH);
  part(group, [
    new THREE.TorusGeometry(0.168, 0.022, 8, 28).rotateX(Math.PI / 2).translate(0, 0.045, 0),
    new THREE.TorusGeometry(0.157, 0.018, 8, 28).rotateX(Math.PI / 2).translate(0, 0.336, 0),
    // Screw collar where the spout meets the yellow cone.
    lathe([[0.056, 0.444], [0.062, 0.452], [0.058, 0.49], [0.04, 0.496], [0, 0.496]], 16),
    taperedRod(SPOUT_BASE, SPOUT_DIRECTION, SPOUT_LENGTH, 0.03, 0.011),
    new THREE.TorusGeometry(0.014, 0.006, 6, 12)
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), SPOUT_DIRECTION))
      .translate(tip.x, tip.y, tip.z),
    tube([
      new THREE.Vector3(-0.16, 0.29, 0),
      new THREE.Vector3(-0.245, 0.305, 0),
      new THREE.Vector3(-0.285, 0.22, 0),
      new THREE.Vector3(-0.25, 0.13, 0),
      new THREE.Vector3(-0.163, 0.11, 0),
    ], 0.021),
  ], metal);

  // A drip hangs just under the spout tip.
  const drip = new THREE.Vector3(tip.x + 0.008, tip.y - 0.085, 0);
  part(group, [lathe([
    [0, 0], [0.014, 0.004], [0.02, 0.016], [0.017, 0.03], [0.009, 0.046], [0, 0.064],
  ], 12).translate(drip.x, drip.y, drip.z)], oil);
  part(group, [new THREE.SphereGeometry(0.0055, 6, 4).translate(drip.x - 0.008, drip.y + 0.022, 0.014)],
    glint, false);

  // Oil-drop stamp on both faces of the label.
  part(group, [1, -1].map((side) => extrudedShape(dropShape(0.088), 0.006, 0.002)
    .rotateY(side > 0 ? 0 : Math.PI)
    .translate(0, 0.186, side * 0.173)), ink, false);
  return group;
}
