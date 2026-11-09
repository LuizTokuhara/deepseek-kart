import type { Fog, Node, Scene } from "three/webgpu";
import {
  Fn, max, mix, output, rangeFogFactor, reference, renderGroup,
  sRGBTransferEOTF, sRGBTransferOETF, vec4,
} from "three/tsl";

/** Preserve the art-directed display-space blend, returning linear HDR to bloom. */
export function blendFogInSrgb(scene: Scene, fog: Fog): void {
  const color = reference("color", "color", fog).setGroup(renderGroup);
  const factor = rangeFogFactor(
    reference("near", "float", fog).setGroup(renderGroup),
    reference("far", "float", fog).setGroup(renderGroup),
  );
  (scene as Scene & { fogNode: Node }).fogNode = Fn(() => {
    // Negative light values must not reach the fractional power in the sRGB curve.
    const surface = vec4(sRGBTransferOETF(vec4(max(output.rgb, 0), 1)) as Node<"vec4">).rgb;
    const haze = vec4(sRGBTransferOETF(vec4(color, 1)) as Node<"vec4">).rgb;
    const blended = vec4(sRGBTransferEOTF(vec4(mix(surface, haze, factor), 1)) as Node<"vec4">).rgb;
    return vec4(blended, output.a);
  })();
}
