import * as THREE from "three/webgpu";
import {
  diffuseColor,
  float,
  normalView,
  positionViewDirection,
  smoothstep,
  vec3,
} from "three/tsl";

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
  new Uint8Array([40, 40, 40, 118, 118, 240, 240, 240]), 8, 1, THREE.RedFormat,
);
kartGradient.minFilter = kartGradient.magFilter = THREE.NearestFilter;
kartGradient.generateMipmaps = false;
kartGradient.needsUpdate = true;

type ToonWithGradient = THREE.MeshToonNodeMaterial & {
  gradientMap: THREE.Texture | null;
};

class KartPaintMaterial extends THREE.MeshToonNodeMaterial {
  static override get type(): string { return "KartPaintMaterial"; }

  override setupLightingModel(): ReturnType<THREE.MeshToonNodeMaterial["setupLightingModel"]> {
    const model = super.setupLightingModel();
    const indirect = model.indirect.bind(model);
    model.indirect = (builder) => {
      indirect(builder);
      const { reflectedLight } = builder.context as {
        reflectedLight: { indirectDiffuse: THREE.Node<"vec3">; directDiffuse: THREE.Node<"vec3"> };
      };
      reflectedLight.indirectDiffuse.mulAssign(vec3(0.72, 0.76, 0.88));
      const facing = float(1).sub(normalView.dot(positionViewDirection).saturate());
      const band = smoothstep(0.62, 0.68, facing)
        .mul(smoothstep(-0.1, 0.3, normalView.y));
      // Add once after light accumulation, not once per light or as emission.
      reflectedLight.directDiffuse.addAssign(
        band.mul(diffuseColor.rgb.mul(0.55).add(vec3(0.1, 0.12, 0.16))),
      );
    };
    return model;
  }
}

/** Kart paint: cool indirect shadows and a hard sky-lit rim, before fog/bloom. */
export function kartCelMaterial(color: number, thickness = 0): THREE.MeshToonNodeMaterial {
  const material = new KartPaintMaterial({ color });
  if (thickness > 0) {
    inkOutline(material, thickness);
    material.userData.outlineParameters.minimumPixels = 1.5;
    material.userData.outlineParameters.silhouette = true;
  } else material.userData.outlineParameters = { visible: false };
  (material as ToonWithGradient).gradientMap = kartGradient;
  maskKartSurface(material);
  return material;
}

/** Reserve visible kart paint, including decals, from the external ink pass. */
export function maskKartSurface(material: THREE.Material): void {
  material.stencilWrite = true;
  material.stencilRef = 1;
  material.stencilFunc = THREE.AlwaysStencilFunc;
  material.stencilZPass = THREE.ReplaceStencilOp;
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
): THREE.MeshToonNodeMaterial {
  const material = new THREE.MeshToonNodeMaterial({ color });
  (material as ToonWithGradient).gradientMap = gradientMap;
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
): THREE.MeshToonNodeMaterial {
  const material = celMaterial(color);
  inkOutline(material, thickness, 0x000000);
  return material;
}
