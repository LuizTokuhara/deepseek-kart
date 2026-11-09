import * as THREE from "three/webgpu";
import BloomNode from "three/addons/tsl/display/BloomNode.js";

/** r187 compatibility: UnrealBloomPass rounds each mip; BloomNode floors it. */
export class PaintedBloomNode extends BloomNode {
  override setSize(width: number, height: number): void {
    // These r187 internals are confined here. Keep kernels/composition in Three,
    // changing only sizing so odd viewport sizes retain the old halo distribution.
    const buffers = this as unknown as {
      _renderTargetBright: THREE.RenderTarget;
      _renderTargetsHorizontal: THREE.RenderTarget[];
      _renderTargetsVertical: THREE.RenderTarget[];
      _separableBlurMaterials: { invSize: { value: THREE.Vector2 } }[];
    };
    let w = Math.max(1, Math.round(width * this.getResolutionScale()));
    let h = Math.max(1, Math.round(height * this.getResolutionScale()));
    buffers._renderTargetBright.setSize(w, h);
    for (let i = 0; i < buffers._renderTargetsHorizontal.length; i++) {
      buffers._renderTargetsHorizontal[i].setSize(w, h);
      buffers._renderTargetsVertical[i].setSize(w, h);
      buffers._separableBlurMaterials[i]?.invSize.value.set(1 / w, 1 / h);
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
    }
  }
}
