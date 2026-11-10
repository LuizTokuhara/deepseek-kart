import * as THREE from "three/webgpu";
import {
  Fn,
  cameraProjectionMatrix,
  modelViewMatrix,
  max,
  normalLocal,
  positionLocal,
  screenDPR,
  screenSize,
  uniform,
  vec2,
  vec4,
} from "three/tsl";

export interface OutlineStyle {
  /** Linear ink color, matching the old OutlineEffect shader. */
  readonly color: number;
  /** Stroke width in CSS pixels (instanced batches). */
  readonly pixels?: number;
  /** Clip-space width (regular meshes, same convention as OutlineEffect). */
  readonly clipThickness?: number;
  /** Keep important silhouettes readable when their viewport-scaled width is subpixel. */
  readonly minimumPixels?: number;
  /** Draw both sides outside the stencil mask left by the kart paint. */
  readonly silhouette?: boolean;
  readonly alpha?: number;
}

const DEFAULT_STYLE: OutlineStyle = { color: 0x111622, clipThickness: 0.0012 };

const materialCache = new WeakMap<
  THREE.Material,
  Map<string, { material: THREE.MeshBasicNodeMaterial; users: number }>
>();
const hiddenOutlineMaterial = new THREE.MeshBasicNodeMaterial({ visible: false });

/**
 * Inverted-hull ink stroke for the WebGPU renderer. `OutlineEffect` is a
 * WebGLRenderer addon, so the same look is rebuilt from a TSL node material:
 * faces are pushed outwards in screen space by a constant pixel width. Kart
 * silhouettes use both sides plus the paint's stencil mask to close rear-view gaps.
 */
function outlineMaterialFor(
  source: THREE.Material,
  style: OutlineStyle,
): THREE.MeshBasicNodeMaterial {
  const key = `${style.pixels !== undefined ? `px:${style.pixels}` : `clip:${style.clipThickness}`}|silhouette:${style.silhouette ?? false}|min:${style.minimumPixels ?? 0}|${style.color}|${style.alpha ?? 1}`;
  let variants = materialCache.get(source);
  if (!variants) {
    variants = new Map();
    materialCache.set(source, variants);
    const sourceVariants = variants;
    source.addEventListener("dispose", () => {
      for (const entry of sourceVariants.values()) entry.material.dispose();
      sourceVariants.clear();
      materialCache.delete(source);
    });
  }
  const cached = variants.get(key);
  if (cached) {
    cached.users++;
    return cached.material;
  }

  const pixelUnit = screenDPR.mul(2).div(screenSize.y);
  const stroke = style.pixels !== undefined
    ? uniform(style.pixels).mul(pixelUnit)
    : max(uniform(style.clipThickness ?? 0.0012), pixelUnit.mul(style.minimumPixels ?? 0));
  const ink = uniform(new THREE.Color(style.color));
  const material = new THREE.MeshBasicNodeMaterial({
    side: style.silhouette ? THREE.DoubleSide : THREE.BackSide,
    depthWrite: false,
    fog: true,
    transparent: (style.alpha ?? 1) < 1,
  });
  if (style.silhouette) {
    material.stencilWrite = true;
    material.stencilRef = 1;
    material.stencilFunc = THREE.NotEqualStencilFunc;
    material.stencilWriteMask = 0;
  }
  material.name = `${source.name || "material"}-ink`;
  material.colorNode = ink;
  material.opacity = style.alpha ?? 1;
  material.vertexNode = Fn(() => {
    const clip = cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(positionLocal, 1)));
    const pushed = cameraProjectionMatrix.mul(
      modelViewMatrix.mul(vec4(positionLocal.add(normalLocal), 1)),
    );
    const width = stroke.mul(clip.w);
    // Normalize after perspective division. Extruding the 4D clip vector also
    // changes depth and w, which thins or buries the stroke at oblique angles.
    const aspect = screenSize.x.div(screenSize.y);
    const delta = pushed.xy.div(pushed.w).sub(clip.xy.div(clip.w)).mul(vec2(aspect, 1));
    const direction = delta.div(max(delta.length(), 0.000001)).div(vec2(aspect, 1));
    return vec4(clip.xy.add(direction.mul(width)), clip.z, clip.w);
  })();
  material.userData.isOutline = true;
  material.userData.outlineSource = source;
  material.userData.outlineCacheKey = key;

  variants.set(key, { material, users: 1 });
  return material;
}

/** Style stored by `inkOutline()` or supplied explicitly for instanced batches. */
export function outlineStyle(material: THREE.Material, pixels?: number): OutlineStyle | null {
  const parameters = material.userData.outlineParameters as
    | { visible?: boolean; color?: number[]; thickness?: number; alpha?: number; minimumPixels?: number; silhouette?: boolean }
    | undefined;
  if (!parameters) {
    return pixels === undefined
      ? null
      : { ...DEFAULT_STYLE, pixels, clipThickness: undefined };
  }
  if (pixels === undefined && parameters.visible !== true) return null;

  return pixels !== undefined
    ? {
      color: parameters.color
        ? new THREE.Color().fromArray(parameters.color).getHex()
        : DEFAULT_STYLE.color,
      pixels,
      alpha: parameters.alpha ?? 1,
    }
    : {
      color: parameters.color
        ? new THREE.Color().fromArray(parameters.color).getHex()
        : DEFAULT_STYLE.color,
      // Same clip-space convention as OutlineEffect, so thickness scales with
      // the viewport instead of using a fixed physical pixel count.
      clipThickness: parameters.thickness ?? 0.0012,
      minimumPixels: parameters.minimumPixels,
      silhouette: parameters.silhouette,
      alpha: parameters.alpha ?? 1,
    };
}

/**
 * Creates an ink hull sharing geometry, instance matrices and local transform
 * with the source. Kart hulls are masked by paint; other props use back faces.
 */
export function createOutlineObject(
  source: THREE.Mesh,
  pixels?: number,
): THREE.Mesh | THREE.InstancedMesh | null {
  if (source.userData.isOutline) return null;

  const sourceMaterials = Array.isArray(source.material)
    ? source.material
    : [source.material];
  const styles = sourceMaterials.map((material) => outlineStyle(material, pixels));
  if (styles.every((style) => style === null)) return null;

  const outlineMaterials = sourceMaterials.map((material, index) =>
    styles[index] ? outlineMaterialFor(material, styles[index]!) : hiddenOutlineMaterial);
  const materials = Array.isArray(source.material) ? outlineMaterials : outlineMaterials[0];

  const outline = source instanceof THREE.InstancedMesh
    ? new THREE.InstancedMesh(source.geometry, materials, source.count)
    : new THREE.Mesh(source.geometry, materials);
  outline.name = `${source.name || "mesh"}-ink`;
  outline.userData.isOutline = true;
  outline.castShadow = false;
  outline.receiveShadow = false;
  // Complete all opaque kart masks before drawing any external ink.
  outline.renderOrder = styles.some(style => style?.silhouette)
    ? source.renderOrder + 1 : source.renderOrder;
  outline.frustumCulled = source.frustumCulled;

  if (outline instanceof THREE.InstancedMesh && source instanceof THREE.InstancedMesh) {
    outline.instanceMatrix = source.instanceMatrix;
    outline.count = source.count;
    // Some batches (missile trails, particles) recycle their count at runtime.
    outline.onBeforeRender = () => {
      outline.count = source.count;
    };
  }

  return outline;
}

/** Release generated materials only; geometry and instance data belong to the source. */
export function releaseOutlineObject(outline: THREE.Mesh): void {
  const materials = Array.isArray(outline.material) ? outline.material : [outline.material];
  for (const material of materials) {
    const source = material.userData.outlineSource as THREE.Material | undefined;
    if (!source) continue;
    const variants = materialCache.get(source);
    const key = material.userData.outlineCacheKey as string;
    const entry = variants?.get(key);
    if (!entry || entry.material !== material) continue;
    entry.users--;
    if (entry.users === 0 && source.userData.outlineParameters?.keepAlive !== true) {
      entry.material.dispose();
      variants!.delete(key);
    }
  }
}
