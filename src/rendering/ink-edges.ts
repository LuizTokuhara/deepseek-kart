import * as THREE from "three/webgpu";
import { CAMERA } from "../core/config";
import {
  abs,
  clamp,
  float,
  max,
  min,
  mix,
  mrt,
  perspectiveDepthToViewZ,
  screenDPR,
  screenSize,
  screenUV,
  smoothstep,
  uniform,
  vec2,
} from "three/tsl";

/** Comic ink drawn from the depth buffer; widths are CSS pixels, distances meters. */
export const INK_EDGES = {
  /** Stroke on the near side of every depth jump (object against background). */
  silhouettePixels: 2.4,
  /** Ink tone: the local color multiplied by this (linear). */
  shade: 0.2,
  /** Sample step for creases; the stroke straddles the fold, so it ends up about twice this. */
  creasePixels: 0.9,
  /** Relative depth jump that starts and completes a silhouette stroke. */
  silhouetteJump: [0.035, 0.1],
  /** Fold angle (radians) that starts and completes a crease stroke. */
  creaseAngle: [0.38, 0.7],
  /** Strokes thin toward this fraction of their width between these distances. */
  thinFrom: 25,
  thinTo: 120,
  farWidth: 0.45,
  /**
   * Long lenses magnify the scene; the stroke grows with them up to this
   * factor, so a close-up keeps lines in proportion like a drawn panel.
   */
  maxZoomWidth: 2,
  /** Strokes fade out between these distances, where fog and haze take over. */
  fadeFrom: 110,
  fadeTo: 260,
} as const;

/** Name of the scene pass target that says where ink may go (1) or not (0). */
export const INK_MASK = "ink";
const NO_INK = mrt({ [INK_MASK]: float(0) });

function inkFreeSetup(this: THREE.NodeMaterial, builder: THREE.NodeBuilder): ReturnType<THREE.NodeMaterial["setup"]> {
  // Only the scene pass has the mask target; shadow maps and other passes
  // would get an output struct with no members.
  this.mrtNode = builder.renderer.getMRT()?.has(INK_MASK) ? NO_INK : null;
  return (Object.getPrototypeOf(this) as THREE.NodeMaterial).setup.call(this, builder);
}

/**
 * Keeps the screen-space ink off a material: dense thin geometry such as grass,
 * where a stroke per blade would blacken the field, or models that already
 * carry tuned ink hulls. Classic materials work too: the renderer copies every
 * own key, this hook included, onto the node material it builds from them.
 */
export function withoutInk<T extends THREE.Material>(material: T): T {
  (material as unknown as { setup: typeof inkFreeSetup }).setup = inkFreeSetup;
  return material;
}

const AROUND = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
] as const;

/**
 * Screen-space ink: silhouettes where depth jumps away from the pixel, and
 * creases where the surface folds. Folds come from the second difference of
 * inverse depth, which is exactly zero on any plane, so flat ground at a
 * grazing angle stays clean while box corners, wheel rims and barrier joints
 * get a line. Inverted-hull outlines skip depth, so both coexist.
 */
export class InkEdges {
  /** 0..1 ink coverage for the current pixel. */
  readonly coverage: THREE.Node<"float">;
  readonly strength = uniform(1);

  constructor(depth: THREE.TextureNode, mask: THREE.TextureNode, camera: THREE.PerspectiveCamera) {
    const near = uniform(camera.near).onRenderUpdate(() => camera.near);
    const far = uniform(camera.far).onRenderUpdate(() => camera.far);
    // projectionMatrix[1][1] = 1 / tan(fov / 2); follows the speed FOV kick.
    const focal = uniform(1).onRenderUpdate(() => camera.projectionMatrix.elements[5]);

    const texel = vec2(1).div(screenSize).toConst();
    // Taps past the frame would wrap to the opposite edge (sky under the road).
    const inside = (uv: THREE.Node<"vec2">) => clamp(uv, texel.mul(0.5), texel.mul(-0.5).add(1));
    const viewDepth = (uv: THREE.Node<"vec2">) =>
      perspectiveDepthToViewZ(depth.sample(inside(uv)).r, near, far).negate();
    const center = viewDepth(screenUV).toConst();

    // 1 at the race camera's base FOV, more on the cinematic's long lenses.
    const zoom = clamp(focal.mul(Math.tan(THREE.MathUtils.degToRad(CAMERA.baseFov) / 2)), 1,
      INK_EDGES.maxZoomWidth);
    const thin = zoom.mul(mix(float(1), float(INK_EDGES.farWidth),
      smoothstep(INK_EDGES.thinFrom, INK_EDGES.thinTo, center)));
    const reach = texel.mul(screenDPR.mul(INK_EDGES.silhouettePixels).mul(thin)).toConst();
    let farthest: THREE.Node<"float"> = center;
    let nearest: THREE.Node<"float"> = center;
    for (const [x, y] of AROUND) {
      const sample = viewDepth(screenUV.add(reach.mul(vec2(x, y))));
      farthest = max(farthest, sample);
      nearest = min(nearest, sample);
    }
    const [jumpFrom, jumpTo] = INK_EDGES.silhouetteJump;
    // Only the near side inks, so the stroke hugs the object, not the backdrop.
    const silhouette = smoothstep(jumpFrom, jumpTo, farthest.div(center).sub(1));
    const nearDepthJump = smoothstep(jumpFrom, jumpTo, center.div(nearest).sub(1));

    const pixels = screenDPR.mul(INK_EDGES.creasePixels).mul(thin).max(1);
    const step = texel.mul(pixels).toConst();
    // Angle between the center and a neighbor tap, for converting to slopes.
    const tapAngle = pixels.mul(2).div(screenSize.y.mul(focal)).toConst();
    const inverse = (uv: THREE.Node<"vec2">) => float(1).div(viewDepth(uv));
    const middle = float(1).div(center).toConst();
    const fold = (axis: THREE.Node<"vec2">) => {
      const ahead = inverse(screenUV.add(axis));
      const behind = inverse(screenUV.sub(axis));
      // Relative slope = tan(incidence); relative second difference = its jump.
      const slope = ahead.sub(behind).div(tapAngle.mul(middle).mul(2));
      const bend = abs(ahead.add(behind).sub(middle.mul(2))).div(tapAngle.mul(middle));
      // d(angle) = d(tan) / (1 + tan²): grazing faces need a bigger slope jump.
      return bend.div(slope.mul(slope).add(1));
    };
    const angle = max(fold(vec2(step.x, 0)), fold(vec2(0, step.y)));
    const [foldFrom, foldTo] = INK_EDGES.creaseAngle;
    // The second difference also spikes beside a silhouette; keep that side clean.
    const crease = smoothstep(foldFrom, foldTo, angle).mul(nearDepthJump.oneMinus());

    const fade = smoothstep(INK_EDGES.fadeFrom, INK_EDGES.fadeTo, center).oneMinus();
    this.coverage = max(silhouette, crease).mul(fade).mul(mask.sample(screenUV).r).mul(this.strength);
  }

  /**
   * Lays the ink over a linear scene color. The stroke is the paint it sits on,
   * darkened, rather than flat black: warm sand gets a deep brown line and the
   * night city a deep blue one, so heavy linework does not muddy the scene.
   * Glowing HDR paint is normalized first, so lines on lamps do not glow.
   */
  apply(color: THREE.Node<"vec3">, amount: THREE.Node<"float"> = float(1)): THREE.Node<"vec3"> {
    const peak = max(max(color.r, color.g), max(color.b, float(1)));
    return mix(color, color.div(peak).mul(INK_EDGES.shade), this.coverage.mul(amount));
  }
}
