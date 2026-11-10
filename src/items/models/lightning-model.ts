import * as THREE from "three";
import { COLORS } from "../../core/config";
import { outlinedMaterial } from "../../rendering/cel-shading";
import { glowColor } from "../../rendering/glow";
import { extrudedShape, part, unlitMaterial } from "./parts";

const gold = outlinedMaterial(COLORS.lightning, 0.0022);
// The core runs a little hot, so the bolt carries a faint bloom halo.
const core = unlitMaterial(glowColor(0xfff3b8, 1.7));

/** Classic zigzag bolt, about one meter tall, as [x, y]. */
const BOLT = [
  [-0.05, 0.54], [0.23, 0.54], [0.07, 0.13], [0.25, 0.13],
  [-0.13, -0.56], [-0.01, -0.06], [-0.2, -0.06],
] as const;

function boltShape(scale: number): THREE.Shape {
  const shape = new THREE.Shape();
  BOLT.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x * scale, y * scale);
    else shape.lineTo(x * scale, y * scale);
  });
  shape.closePath();
  return shape;
}

/**
 * Chunky beveled bolt with a glowing inset core on both faces, so it reads as
 * charged energy from any side. It stands on y = 0, faces ±Z.
 */
export function lightningModel(): THREE.Group {
  const group = new THREE.Group();
  const depth = 0.1;
  part(group, [extrudedShape(boltShape(0.92), depth, 0.035).translate(0, 0.54, 0)], gold);
  part(group, [1, -1].map((side) => extrudedShape(boltShape(0.5), 0.01, 0.006)
    .translate(0.004, 0.54, side * (depth / 2 + 0.028))), core, false);
  return group;
}
