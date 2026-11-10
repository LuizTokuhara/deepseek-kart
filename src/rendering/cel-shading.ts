import * as THREE from "three/webgpu";
import {
  diffuseColor,
  float,
  fwidth,
  normalView,
  normalWorld,
  positionViewDirection,
  smoothstep,
  vec3,
} from "three/tsl";
import { hatchShade, keyLight } from "./hatching";

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

type LightingContext = {
  outgoingLight: THREE.Node<"vec3">;
  reflectedLight: Record<"directDiffuse" | "indirectDiffuse" | "directSpecular", THREE.Node<"vec3">>;
};

/** Hard anime glint on kart paint; `size` is cos of its angular radius. */
const GLINT = { size: 0.965, strength: 0.8 } as const;

/** Toon shading plus screen-space ink hatching across its shadow band. */
class HatchedToonMaterial extends THREE.MeshToonNodeMaterial {
  static override get type(): string { return "HatchedToonMaterial"; }

  override setupLightingModel(): ReturnType<THREE.MeshToonNodeMaterial["setupLightingModel"]> {
    const model = super.setupLightingModel();
    model.finish = (builder) => {
      // After every light: the direct sum says how much of the key light lands here.
      const { outgoingLight, reflectedLight } = builder.context as unknown as LightingContext;
      outgoingLight.mulAssign(hatchShade(reflectedLight.directDiffuse));
    };
    return model;
  }
}

class KartPaintMaterial extends THREE.MeshToonNodeMaterial {
  static override get type(): string { return "KartPaintMaterial"; }

  /** Glossy paint glints; rubber and dark chassis parts stay matte. */
  glint = true;

  // The flag changes the shader, so matte and glossy paint must not share a program.
  override customProgramCacheKey(): string {
    return `${super.customProgramCacheKey()}|glint:${this.glint}`;
  }

  override setupLightingModel(): ReturnType<THREE.MeshToonNodeMaterial["setupLightingModel"]> {
    const model = super.setupLightingModel();
    const direct = model.direct.bind(model);
    model.direct = (light, builder) => {
      direct(light, builder);
      const { lightDirection, lightColor, reflectedLight, lightNode } = light as unknown as {
        lightDirection: THREE.Node<"vec3">;
        lightColor: THREE.Node<"vec3">;
        reflectedLight: LightingContext["reflectedLight"];
        lightNode: { light: THREE.Light };
      };
      // Sun or moon only: lamp glints on the grille read as stains, not shine.
      if (!this.glint || !(lightNode.light as THREE.DirectionalLight).isDirectionalLight) return;
      // Blinn half vector, cut hard: a crisp white shape, not a soft sheen.
      // The light color carries its shadow, so shaded paint never glints.
      const facing = normalView.dot(lightDirection.add(positionViewDirection).normalize());
      const edge = fwidth(facing).max(0.002);
      // Only on the upper body: shadow maps miss the inside of the exhausts.
      const glint = smoothstep(float(GLINT.size).sub(edge), float(GLINT.size).add(edge), facing)
        .mul(smoothstep(0.2, 0.5, normalWorld.y));
      reflectedLight.directSpecular.addAssign(lightColor.div(keyLight).mul(glint.mul(GLINT.strength)));
    };
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

/** Kart paint: cool indirect shadows, a hard sky-lit rim and a glint, before fog/bloom. */
export function kartCelMaterial(
  color: number,
  thickness = 0,
  { glint = true }: { glint?: boolean } = {},
): THREE.MeshToonNodeMaterial {
  const material = new KartPaintMaterial({ color });
  material.glint = glint;
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

/**
 * Three painted tones shared by vehicles, items and scenery, hatched in shadow
 * unless `hatch` is false (the title logo lives under its own lights).
 */
export function celMaterial(
  color: number,
  outlineThickness = 0,
  { hatch = true }: { hatch?: boolean } = {},
): THREE.MeshToonNodeMaterial {
  const material = hatch
    ? new HatchedToonMaterial({ color })
    : new THREE.MeshToonNodeMaterial({ color });
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
