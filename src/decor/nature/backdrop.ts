import * as THREE from "three/webgpu";
import { mix, output, positionWorld, smoothstep, uniform, vec4 } from "three/tsl";
import { celMaterial, INK_COLOR, inkOutline } from "../../rendering/cel-shading";
import { VISUAL_QUALITY, type VisualQuality } from "../../core/visual-quality";

/** Peaks per ring; each ring is offset so the silhouettes interleave. */
const PEAKS_PER_LAYER = 22;
/** Ground line of the ranges; they sink a little below the terrain. */
const BASE_Y = -4;

/**
 * Rings of ranges, nearest first. Each farther ring sits deeper in the air:
 * more of the horizon color, fainter ink, and taller peaks so it still shows
 * above the ring in front.
 */
const LAYERS = [
  { gap: 56, haze: 0.12, ink: 0.0008, inkFade: 0, height: 0 },
  { gap: 91, haze: 0.4, ink: 0.0005, inkFade: 0.55, height: 8 },
  { gap: 132, haze: 0.66, ink: 0, inkFade: 1, height: 20 },
] as const;

/** Mist that pools at the foot of every range, fading toward the peaks. */
const FOOT_MIST = 0.55;
const MIST_TOP = 26;

/**
 * Distant scenery stays beyond map bounds and never changes driving collisions.
 * `haze` is the course horizon color, which the ranges fade into with distance
 * and toward their foot (aerial perspective).
 */
export function createBackdrop(
  width: number,
  depth: number,
  color: number,
  haze = 0x8cbdce,
  quality: VisualQuality = VISUAL_QUALITY,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "layered-landscape";
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const dummy = new THREE.Object3D();
  const hazeColor = new THREE.Color(haze);
  const peaks = Math.max(8, Math.min(PEAKS_PER_LAYER, quality.backdropPeaks));

  LAYERS.forEach((layer, index) => {
    const material = backdropMaterial(color, hazeColor, layer.haze);
    if (layer.ink > 0) {
      const ink = new THREE.Color(INK_COLOR).lerp(hazeColor, layer.inkFade).getHex();
      inkOutline(material, layer.ink, ink);
    }
    const mesh = new THREE.InstancedMesh(geometry, material, peaks);
    for (let i = 0; i < peaks; i++) {
      const angle = (i + index * 0.6) / peaks * Math.PI * 2;
      const variation = (Math.sin(i * 7.3 + index) + 1) / 2;
      dummy.position.set(
        Math.cos(angle) * (width / 2 + layer.gap),
        BASE_Y,
        Math.sin(angle) * (depth / 2 + layer.gap),
      );
      dummy.scale.set(
        25 + variation * 13 + index * 6,
        18 + variation * 24 + layer.height,
        25 + variation * 10 + index * 6,
      );
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  return group;
}

/**
 * Cel-lit range blended toward the horizon after lighting and fog, so the
 * haze stays flat and bright like air in front of the rock, not paint on it.
 */
function backdropMaterial(
  color: number,
  haze: THREE.Color,
  distanceHaze: number,
): THREE.MeshToonNodeMaterial {
  const material = celMaterial(color);
  const foot = smoothstep(BASE_Y + MIST_TOP, BASE_Y, positionWorld.y).mul(FOOT_MIST);
  const amount = foot.mul(1 - distanceHaze).add(distanceHaze);
  material.outputNode = vec4(mix(output.rgb, uniform(haze), amount), output.a);
  return material;
}
