import * as THREE from "three/webgpu";

/** Keep the scene's HDR/LDR choice independent of the display output buffer. */
export class SceneColorPass extends THREE.PassNode {
  constructor(scene: THREE.Scene, camera: THREE.Camera, type: THREE.TextureDataType, samples: number) {
    super(THREE.PassNode.COLOR, scene, camera, { type, samples, stencilBuffer: true });
  }

  override setup(builder: THREE.NodeBuilder): THREE.Node | null | undefined {
    const result = super.setup(builder);
    // r187 PassNode.setup() replaces options.type with getOutputBufferType().
    // Restore it before allocation: clipping scene light to 1 kills selective bloom.
    this.renderTarget.texture.type = this.options.type!;
    return result;
  }
}
