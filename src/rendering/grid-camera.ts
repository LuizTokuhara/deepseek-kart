import * as THREE from "three";
import { GROUND_Y } from "../core/config";
import { clamp } from "../core/math";
import type { KartState } from "../core/types";

export interface GridCameraPose {
  readonly position: THREE.Vector3;
  readonly look: THREE.Vector3;
}

/**
 * Establishing shot over the starting grid. The start screen and the pre-race
 * flyover start and end here, so the camera can hand off between them without
 * a visible cut; the chase camera then pulls in from this pose.
 */
export function computeGridCameraPose(
  state: Pick<KartState, "pos" | "yaw">,
  aspect: number,
  elapsed: number,
  out: GridCameraPose,
): GridCameraPose {
  const forwardX = Math.sin(state.yaw);
  const forwardZ = Math.cos(state.yaw);
  const rightX = -Math.cos(state.yaw);
  const rightZ = Math.sin(state.yaw);
  const sway = Math.sin(elapsed * 0.22) * 0.9;
  const centerX = state.pos.x + forwardX * 4.4;
  const centerZ = state.pos.z + forwardZ * 4.4;
  // In portrait, move the camera back so the whole grid fits in the scene.
  const portraitScale = clamp(0.85 / Math.min(1, aspect), 1, 1.75);
  const distance = 13.5 * portraitScale;

  out.position.set(
    centerX - forwardX * distance + rightX * (5 + sway),
    4.35 + (portraitScale - 1) * 1.5 + Math.sin(elapsed * 0.35) * 0.06,
    centerZ - forwardZ * distance + rightZ * (5 + sway),
  );
  out.look.set(
    centerX + forwardX * 1.2,
    GROUND_Y + 1.05,
    centerZ + forwardZ * 1.2,
  );
  return out;
}
