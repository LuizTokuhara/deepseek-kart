import { GROUND_Y, PHYSICS } from "./config";
import { localToWorld2D, worldToLocal2D } from "./math";
import type { CircleObbHit, ColliderBox, KartState } from "./types";

const EPSILON = 1e-8;

/** Colisão simples de dois karts como círculos, com separação e impulso. */
export function resolveKartPair(a: KartState, b: KartState): void {
  let dx = b.pos.x - a.pos.x;
  let dz = b.pos.z - a.pos.z;
  const minDistance = PHYSICS.kartRadius * 2;
  let distanceSq = dx * dx + dz * dz;

  if (distanceSq >= minDistance * minDistance) {
    return;
  }

  if (distanceSq < EPSILON) {
    dx = 1;
    dz = 0;
    distanceSq = 1;
  }

  const distance = Math.sqrt(distanceSq);
  const nx = dx / distance;
  const nz = dz / distance;
  const penetration = minDistance - distance;
  const halfPenetration = penetration * 0.5;

  a.pos.x -= nx * halfPenetration;
  a.pos.z -= nz * halfPenetration;
  b.pos.x += nx * halfPenetration;
  b.pos.z += nz * halfPenetration;

  const relativeNormalVelocity =
    (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;

  if (relativeNormalVelocity < 0) {
    const impulse =
      (-(1 + PHYSICS.kartRestitution) * relativeNormalVelocity) / 2;
    a.vel.x -= nx * impulse;
    a.vel.z -= nz * impulse;
    b.vel.x += nx * impulse;
    b.vel.z += nz * impulse;
  }
}

/**
 * Testa um círculo 2D (XZ) contra uma caixa orientada.
 * Retorna a normal que aponta da caixa para o círculo e a penetração.
 */
export function resolveCircleObb(
  circleX: number,
  circleZ: number,
  radius: number,
  box: ColliderBox,
): CircleObbHit | null {
  if (box.enabled === false) return null;
  const dx = circleX - box.center.x;
  const dz = circleZ - box.center.z;

  const broadRadius = radius + Math.hypot(box.half.x, box.half.z);
  if (dx * dx + dz * dz > broadRadius * broadRadius) {
    return null;
  }

  const local = worldToLocal2D(dx, dz, box.yaw);

  const closestX = Math.max(-box.half.x, Math.min(box.half.x, local.x));
  const closestZ = Math.max(-box.half.z, Math.min(box.half.z, local.z));

  const deltaX = local.x - closestX;
  const deltaZ = local.z - closestZ;
  const distanceSq = deltaX * deltaX + deltaZ * deltaZ;

  if (distanceSq > radius * radius) {
    return null;
  }

  let normalLocalX: number;
  let normalLocalZ: number;
  let depth: number;

  if (distanceSq > EPSILON) {
    const distance = Math.sqrt(distanceSq);
    normalLocalX = deltaX / distance;
    normalLocalZ = deltaZ / distance;
    depth = radius - distance;
  } else {
    // Centro dentro da caixa: escolhe a face mais próxima.
    const faceX = box.half.x - Math.abs(local.x);
    const faceZ = box.half.z - Math.abs(local.z);

    if (faceX < faceZ) {
      normalLocalX = local.x >= 0 ? 1 : -1;
      normalLocalZ = 0;
      depth = radius + faceX;
    } else {
      normalLocalX = 0;
      normalLocalZ = local.z >= 0 ? 1 : -1;
      depth = radius + faceZ;
    }
  }

  const normal = localToWorld2D(normalLocalX, normalLocalZ, box.yaw);

  return { normal, depth };
}

export class CollisionWorld {
  readonly colliders: ColliderBox[];

  constructor(colliders: ColliderBox[] = []) {
    this.colliders = colliders;
  }

  resolveKart(state: KartState): void {
    const forwardX = Math.sin(state.yaw);
    const forwardZ = Math.cos(state.yaw);

    let maxImpact = 0;

    // Duas ou três iterações resolvem cantos formados por duas paredes.
    for (let iteration = 0; iteration < 3; iteration++) {
      let touched = false;

      for (const box of this.colliders) {
        if (box.heightAware && (state.falling || GROUND_Y + state.height > box.center.y + box.half.y + 0.05)) continue;
        for (const side of [1, -1]) {
          const circleX = state.pos.x + forwardX * PHYSICS.capsuleOffset * side;
          const circleZ = state.pos.z + forwardZ * PHYSICS.capsuleOffset * side;

          const hit = resolveCircleObb(circleX, circleZ, PHYSICS.collisionRadius, box);
          if (!hit) {
            continue;
          }

          box.onKartContact?.(state);
          if (box.enabled === false) break;

          touched = true;
          state.pos.x += hit.normal.x * hit.depth;
          state.pos.z += hit.normal.z * hit.depth;

          const normalVelocity = state.vel.x * hit.normal.x + state.vel.z * hit.normal.z;
          if (normalVelocity < 0) {
            const impulse = normalVelocity * (1 + PHYSICS.wallRestitution);
            state.vel.x -= hit.normal.x * impulse;
            state.vel.z -= hit.normal.z * impulse;
            maxImpact = Math.max(maxImpact, Math.min(1, -normalVelocity / PHYSICS.topSpeed));
          }
        }
      }

      if (!touched) {
        break;
      }
    }

    if (maxImpact > 0) {
      const scale = 1 - PHYSICS.wallImpactSlow * maxImpact;
      state.vel.x *= scale;
      state.vel.z *= scale;
    }
  }

  /**
   * Ray 3D contra os OBBs. Usado pela câmera para não atravessar paredes.
   * `direction` deve estar normalizada. Retorna a distância do primeiro hit.
   */
  raycast(
    originX: number,
    originY: number,
    originZ: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    maxDistance: number,
  ): number | null {
    if (maxDistance <= 0) {
      return null;
    }

    let best = Infinity;

    for (const box of this.colliders) {
      if (box.enabled === false) continue;
      const dx = originX - box.center.x;
      const dy = originY - box.center.y;
      const dz = originZ - box.center.z;

      const localOrigin = worldToLocal2D(dx, dz, box.yaw);
      const localDir = worldToLocal2D(dirX, dirZ, box.yaw);

      let tMin = 0;
      let tMax = maxDistance;
      let hit = true;

      const axes = [
        [localOrigin.x, localDir.x, box.half.x],
        [dy, dirY, box.half.y],
        [localOrigin.z, localDir.z, box.half.z],
      ] as const;

      for (const [origin, direction, half] of axes) {
        if (Math.abs(direction) < EPSILON) {
          if (origin < -half || origin > half) {
            hit = false;
            break;
          }
          continue;
        }

        let t1 = (-half - origin) / direction;
        let t2 = (half - origin) / direction;
        if (t1 > t2) {
          const temp = t1;
          t1 = t2;
          t2 = temp;
        }

        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);

        if (tMin > tMax) {
          hit = false;
          break;
        }
      }

      if (!hit) {
        continue;
      }

      // Se a origem estiver dentro da caixa, usa a saída para empurrar a câmera.
      const distance = tMin > 0.001 ? tMin : tMax;
      if (distance >= 0 && distance <= maxDistance) {
        best = Math.min(best, distance);
      }
    }

    return best === Infinity ? null : best;
  }
}
