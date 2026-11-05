import * as THREE from "three";
import { celMaterial } from "../rendering/cel-shading";

/** Generate the rainbow face and outlined question mark without a DOM or assets. */
function questionTexture(): THREE.DataTexture {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  const hook = [
    [0.29, 0.32], [0.31, 0.23], [0.4, 0.18], [0.57, 0.18],
    [0.67, 0.25], [0.69, 0.35], [0.64, 0.43], [0.54, 0.49],
    [0.49, 0.55], [0.49, 0.63],
  ];
  const color = new THREE.Color();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      // DataTexture starts at the bottom left; the drawing coordinates start at the top.
      const v = 1 - y / (size - 1);
      let distance = Math.hypot(u - 0.49, v - 0.79) - 0.002;
      for (let segment = 1; segment < hook.length; segment++) {
        const [ax, ay] = hook[segment - 1];
        const [bx, by] = hook[segment];
        const dx = bx - ax;
        const dy = by - ay;
        const t = THREE.MathUtils.clamp(((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy), 0, 1);
        distance = Math.min(distance, Math.hypot(u - ax - t * dx, v - ay - t * dy));
      }
      color.setHSL((u * 0.48 + v * 0.34 + 0.53) % 1, 0.72, 0.64);
      color.convertLinearToSRGB();
      const border = Math.min(u, 1 - u, v, 1 - v);
      if (border < 0.045) color.setRGB(0.90, 0.96, 1, THREE.SRGBColorSpace).convertLinearToSRGB();
      if (distance < 0.085) color.setRGB(0.16, 0.22, 0.47, THREE.SRGBColorSpace).convertLinearToSRGB();
      if (distance < 0.057) color.setRGB(1, 1, 0.97, THREE.SRGBColorSpace).convertLinearToSRGB();
      const index = (y * size + x) * 4;
      pixels[index] = Math.round(color.r * 255);
      pixels[index + 1] = Math.round(color.g * 255);
      pixels[index + 2] = Math.round(color.b * 255);
      pixels[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// All item boxes share one material and one small texture.
const face = questionTexture();
export const ITEM_BOX_MATERIAL = celMaterial(0xffffff, 0.0025);
ITEM_BOX_MATERIAL.map = face;
ITEM_BOX_MATERIAL.emissive.setHex(0xffffff);
ITEM_BOX_MATERIAL.emissiveMap = face;
ITEM_BOX_MATERIAL.emissiveIntensity = 0.18;
