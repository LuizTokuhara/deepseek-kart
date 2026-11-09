import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { celMaterial } from "../../rendering/cel-shading";
import { createInstancedOutline } from "../../rendering/instanced-outline";
import { applyWind, windDepthMaterial, type WindOptions } from "../../rendering/wind";
import { batch } from "../common";

export interface SnowPineSpot {
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

const treeGeometry = (() => {
  const parts: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();

  const paint = (
    geometry: THREE.BufferGeometry,
    hex: number,
    topHex?: number,
  ): THREE.BufferGeometry => {
    const position = geometry.getAttribute("position");
    const colors: number[] = [];
    for (let index = 0; index < position.count; index++) {
      const y = position.getY(index);
      if (topHex !== undefined && y > 0.15) {
        color.setHex(topHex);
      } else {
        color.setHex(hex);
      }
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  };

  const trunk = new THREE.CylinderGeometry(0.17, 0.29, 1.5, 6);
  trunk.translate(0, 0.75, 0);
  parts.push(paint(trunk, 0x75523c));

  const layers = [
    { y: 1.25, radius: 1.55, height: 1.9, color: 0x2d644e },
    { y: 2.15, radius: 1.2, height: 1.75, color: 0x37745a },
    { y: 2.95, radius: 0.82, height: 1.5, color: 0x417f61 },
  ];

  for (const layer of layers) {
    const needles = new THREE.ConeGeometry(layer.radius, layer.height, 8);
    needles.translate(0, layer.y + layer.height / 2, 0);
    parts.push(paint(needles, layer.color));

    const snow = new THREE.ConeGeometry(
      layer.radius * 0.78,
      layer.height * 0.38,
      8,
    );
    snow.translate(
      0,
      layer.y + layer.height - layer.height * 0.19 + 0.015,
      0,
    );
    parts.push(paint(snow, 0xe9f8ff, 0xffffff));
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return merged!;
})();

const treeMaterial = celMaterial(0xffffff);
treeMaterial.vertexColors = true;
/** Snow-laden conifers hardly move: only the tip sways. */
const PINE_WIND: WindOptions = { strength: 0.05, from: 1.2, to: 4.5, speed: 0.9 };
applyWind(treeMaterial, PINE_WIND);
const pineDepthMaterial = windDepthMaterial(PINE_WIND);

/** Snowy conifers, grouped into a single instanced mesh. */
export function buildSnowPines(
  spots: readonly SnowPineSpot[],
  parent: THREE.Group,
): void {
  if (spots.length === 0) return;

  const mesh = batch(
    parent,
    treeGeometry,
    treeMaterial,
    spots.map((spot) => ({
      x: spot.x,
      y: 0,
      z: spot.z,
      yaw: spot.rotation,
      scale: spot.scale,
    })),
    true,
  );
  mesh.name = "snow-pines";
  mesh.customDepthMaterial = pineDepthMaterial;
  const outline = createInstancedOutline(mesh, 0.75);
  applyWind(outline.material as THREE.Material, PINE_WIND);
  parent.add(outline);
}
