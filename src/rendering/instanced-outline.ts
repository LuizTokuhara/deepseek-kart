import * as THREE from "three/webgpu";
import { createOutlineObject } from "./outline-material";

/** Inverted hull with per-instance normals and a constant CSS-pixel stroke. */
export function createInstancedOutline(
  source: THREE.InstancedMesh,
  pixels = 1.15,
): THREE.InstancedMesh {
  const outline = createOutlineObject(source, pixels) as THREE.InstancedMesh;

  // The caller adds the hull as a sibling, so keep the source's local transform.
  outline.position.copy(source.position);
  outline.quaternion.copy(source.quaternion);
  outline.scale.copy(source.scale);
  source.userData.outlineObject = outline;

  return outline;
}
