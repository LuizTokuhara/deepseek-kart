import * as THREE from "three";

// Five shadow texels and three lit texels put the cut at N·L = 0.25.
// This is lighting data in linear space, not an sRGB color texture.
const gradientMap = new THREE.DataTexture(
  new Uint8Array([48, 48, 48, 48, 48, 255, 255, 255]),
  8,
  1,
  THREE.RedFormat,
);
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.magFilter = THREE.NearestFilter;
gradientMap.generateMipmaps = false;
gradientMap.needsUpdate = true;

export const INK_COLOR = 0x111622;
export const INK_THICKNESS = 0.0035;

export function inkOutline(
  material: THREE.Material,
  thickness = INK_THICKNESS,
): void {
  material.userData.outlineParameters = {
    visible: true,
    color: new THREE.Color(INK_COLOR).toArray(),
    thickness,
  };
}

/** Two painted tones shared by vehicles, items and scenery. */
export function celMaterial(
  color: number,
  outlineThickness = 0,
): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ color, gradientMap });
  if (outlineThickness > 0) {
    inkOutline(material, outlineThickness);
  } else {
    material.userData.outlineParameters = { visible: false };
  }
  return material;
}
