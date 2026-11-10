import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { randomGenerator } from "../../../decor/common";

type Point = { x: number; y: number };
export interface PyramidMasonryOptions {
  base: number;
  height: number;
  rows: number;
  capHeight: number;
  seed: number;
  door?: { width: number; height: number };
}

/** Clip a masonry course to the actual sloping silhouette, including triangular ends. */
function clipFace(polygon: Point[], base: number, height: number, side: number): Point[] {
  const output: Point[] = [];
  const distance = (p: Point) => base / 2 * (1 - p.y / height) - side * p.x;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const da = distance(a), db = distance(b);
    if (da >= 0) output.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      output.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return output;
}

/** All beveled, staggered facing blocks in one mesh; no draw call per stone. */
export function pyramidMasonryGeometry(options: PyramidMasonryOptions): THREE.BufferGeometry {
  const { base, height, rows, capHeight, door } = options;
  const random = randomGenerator(options.seed);
  const positions: number[] = [], colors: number[] = [];
  const palette = [0xd7a75f, 0xcda15f, 0xddb06b, 0xc99b5b].map(hex => new THREE.Color(hex));
  const brickWidth = Math.max(1.3, Math.min(3.6, base / 7));
  const top = height - capHeight * 0.9;
  const levels = Array.from({ length: rows + 1 }, (_, row) => row * height / rows)
    .filter(y => y < top);
  levels.push(top);
  if (door && !levels.includes(door.height)) levels.push(door.height);
  levels.sort((a, b) => a - b);

  for (let face = 0; face < 4; face++) {
    const angle = face * Math.PI / 2;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const vertex = (p: THREE.Vector3, color: THREE.Color, value: number) => {
      positions.push(p.x * cos + p.z * sin, p.y, -p.x * sin + p.z * cos);
      colors.push(color.r * value, color.g * value, color.b * value);
    };
    const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color, value = 1) => {
      vertex(a, color, value); vertex(b, color, value); vertex(c, color, value);
    };
    for (let row = 0; row < levels.length - 1; row++) {
      const bottom = levels[row] + 0.025, upper = levels[row + 1] - 0.025;
      for (let x = -base / 2 - (row % 2) * brickWidth / 2; x < base / 2; x += brickWidth) {
        const left = x + 0.035, right = x + brickWidth - 0.035;
        const intervals = face === 0 && door && upper < door.height
          ? [[left, Math.min(right, -door.width / 2 - 0.025)],
            [Math.max(left, door.width / 2 + 0.025), right]]
          : [[left, right]];
        for (const [from, to] of intervals) {
          if (to - from < 0.08) continue;
          let polygon = [{ x: from, y: bottom }, { x: to, y: bottom },
            { x: to, y: upper }, { x: from, y: upper }];
          polygon = clipFace(clipFace(polygon, base, height, 1), base, height, -1);
          if (polygon.length < 3) continue;
          const center = polygon.reduce((sum, p) => ({ x: sum.x + p.x / polygon.length,
            y: sum.y + p.y / polygon.length }), { x: 0, y: 0 });
          // Occasional missing casing stones reveal the darker inner masonry.
          if (row < rows * 0.55 && random() < 0.025) continue;
          const tint = palette[Math.floor(random() * palette.length)];
          const recess = 0.012 + random() * 0.045;
          const point = (p: Point, depth: number) => new THREE.Vector3(p.x, p.y,
            base / 2 * (1 - p.y / height) - depth);
          const outer = polygon.map(p => point(p, recess + 0.055));
          const inner = polygon.map(p => point({ x: p.x * 0.94 + center.x * 0.06,
            y: p.y * 0.91 + center.y * 0.09 }, recess));
          const back = polygon.map(p => point(p, 0.22));
          for (let i = 1; i < inner.length - 1; i++) triangle(inner[0], inner[i], inner[i + 1], tint);
          for (let i = 0; i < polygon.length; i++) {
            const next = (i + 1) % polygon.length;
            triangle(outer[i], outer[next], inner[next], tint, 0.9);
            triangle(outer[i], inner[next], inner[i], tint, 0.9);
            triangle(outer[i], back[i], back[next], tint, 0.75);
            triangle(outer[i], back[next], outer[next], tint, 0.75);
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Inner core with a notched front face, leaving actual depth behind the portal. */
export function pyramidCoreGeometry(base: number, height: number, door?: { width: number; height: number }): THREE.BufferGeometry {
  const cone = new THREE.ConeGeometry((base - 0.24) / Math.SQRT2, height - 0.18, 4).toNonIndexed();
  cone.rotateY(Math.PI / 4);
  cone.translate(0, (height - 0.18) / 2, 0);
  cone.computeVertexNormals();
  if (!door) return cone;
  const position = cone.getAttribute("position"), normal = cone.getAttribute("normal"), uv = cone.getAttribute("uv");
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  for (let index = 0; index < position.count; index += 3) {
    if (normal.getZ(index) > 0.3 && Math.abs(normal.getX(index)) < 0.1) continue;
    for (let corner = 0; corner < 3; corner++) {
      const i = index + corner;
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      uvs.push(uv.getX(i), uv.getY(i));
    }
  }
  const core = new THREE.BufferGeometry();
  core.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  core.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  core.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const half = (base - 0.24) / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(-door.width / 2, 0); shape.lineTo(-door.width / 2, door.height);
  shape.lineTo(door.width / 2, door.height); shape.lineTo(door.width / 2, 0);
  shape.lineTo(half, 0); shape.lineTo(0, height - 0.18); shape.closePath();
  const front = new THREE.ShapeGeometry(shape).toNonIndexed();
  const p = front.getAttribute("position");
  for (let i = 0; i < p.count; i++) p.setZ(i, half * (1 - p.getY(i) / (height - 0.18)));
  front.computeVertexNormals();
  const geometry = mergeGeometries([core, front], false)!;
  cone.dispose(); core.dispose(); front.dispose();
  return geometry;
}
