import * as THREE from "three";

// Three discrete painted values: shadow, midtone and sunlit highlight.
// This is lighting data in linear space, not an sRGB color texture.
const gradientMap = new THREE.DataTexture(
  new Uint8Array([62, 62, 62, 62, 145, 145, 245, 245]),
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

// Vehicle paint needs deeper shadow bands than the brightly lit scenery.
const kartGradient = new THREE.DataTexture(
  new Uint8Array([22, 22, 22, 82, 82, 225, 225, 225]), 8, 1, THREE.RedFormat,
);
kartGradient.minFilter = kartGradient.magFilter = THREE.NearestFilter;
kartGradient.generateMipmaps = false;
kartGradient.needsUpdate = true;

export function kartCelMaterial(color: number, thickness = 0): THREE.MeshToonMaterial {
  const material = celMaterial(color, thickness);
  material.gradientMap = kartGradient;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <aomap_fragment>",
      "#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= vec3(0.48, 0.53, 0.65);",
    );
  };
  material.customProgramCacheKey = () => "kart-painted-shadows-v1";
  return material;
}

export function inkOutline(
  material: THREE.Material,
  thickness = INK_THICKNESS,
  color = INK_COLOR,
): void {
  material.userData.outlineParameters = {
    visible: true,
    color: new THREE.Color(color).toArray(),
    thickness,
  };
}

/** Three painted tones shared by vehicles, items and scenery. */
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

/** Fine black silhouette for shared item and scenery assets. */
export function outlinedMaterial(
  color: number,
  thickness = 0.0012,
): THREE.MeshToonMaterial {
  const material = celMaterial(color);
  inkOutline(material, thickness, 0x000000);
  return material;
}
