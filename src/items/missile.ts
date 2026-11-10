import * as THREE from "three";
import { GROUND_Y, ITEMS } from "../core/config";
import { resolveCircleObb, verticallyClear, type CollisionWorld } from "../core/collision";
import type { Kart } from "../actors/kart/kart";
import type { TrackLike } from "../tracks/track";
import { createItemModel } from "./item-model";
import { MISSILE_FLAME } from "./models/missile-model";
import { distanceToKartSq, hitKart, sameLevel } from "./item-hit";
import type { ItemEvent, ItemRacer, KartId } from "./item-types";

const HIT_RADIUS = 0.7;
/** Missile height, so it only bounces off walls on its own level. */
const MISSILE_HEIGHT = 0.6;
/** Where the exhaust leaves the nozzle, in model space. */
const NOZZLE_Z = -0.43;

export interface Missile {
  x: number;
  z: number;
  /** Ground height under the missile: follows ramps and stays on its own level. */
  y: number;
  vx: number;
  vz: number;
  mesh: THREE.Group;
  /** Exhaust flame, flickered every frame. */
  flame: THREE.Object3D | null;
  owner: KartId;
  kind: "white" | "red";
  pathProgress: number;
  life: number;
  immunity: number;
}

export function spawnMissile(
  kart: Kart,
  owner: KartId,
  item: "missile" | "red-missile",
  track: TrackLike,
  group: THREE.Group,
): Missile {
  const forwardX = Math.sin(kart.state.yaw);
  const forwardZ = Math.cos(kart.state.yaw);
  const red = item === "red-missile";
  const speed = red
    ? ITEMS.redMissileSpeed
    : Math.max(ITEMS.missileSpeed, kart.speed * 1.2);
  const x = kart.state.pos.x + forwardX * 1.8;
  const z = kart.state.pos.z + forwardZ * 1.8;
  const y = track.heightAt?.(x, z, kart.state.height) ?? 0;
  const mesh = createItemModel(red ? "red-missile" : "missile");
  mesh.position.set(x, GROUND_Y + y + 0.015, z);
  mesh.rotation.y = Math.atan2(forwardX, forwardZ);
  group.add(mesh);
  const pathIndex = red ? alignedPathIndex(track, x, z, kart.state.yaw) : 0;

  return {
    x,
    z,
    y,
    vx: forwardX * speed,
    vz: forwardZ * speed,
    mesh,
    flame: mesh.getObjectByName(MISSILE_FLAME) ?? null,
    owner,
    kind: red ? "red" : "white",
    pathProgress: red ? pathIndex + 0.6 : 0,
    life: red ? ITEMS.redMissileLife : ITEMS.missileLife,
    immunity: ITEMS.missileOwnerImmunity,
  };
}

export function updateMissiles(
  missiles: Missile[],
  dt: number,
  racers: readonly ItemRacer[],
  track: TrackLike,
  collision: CollisionWorld,
  group: THREE.Group,
  events: ItemEvent[],
): void {
  for (let index = missiles.length - 1; index >= 0; index--) {
    const missile = missiles[index];
    missile.life -= dt;
    missile.immunity -= dt;
    const previousX = missile.x;
    const previousZ = missile.z;

    if (missile.kind === "red") {
      updateRedMissile(dt, missile, racers, track);
    } else {
      updateWhiteMissile(dt, missile, collision);
    }
    missile.y = track.heightAt?.(missile.x, missile.z, missile.y) ?? 0;

    let remove = missile.life <= 0;

    // Only disappears when hitting a kart (actor).
    if (!remove) {
      const hitRadius = ITEMS.missileRadius + HIT_RADIUS;
      const item = missile.kind === "red" ? "red-missile" : "missile";

      for (const racer of racers) {
        if (
          racer.kart.state.spinTimer > 0 ||
          (missile.owner === racer.id && missile.immunity > 0)
        ) {
          continue;
        }

        if (
          sameLevel(missile.y, racer.kart) &&
          distanceToKartSq(missile, racer.kart) <= hitRadius * hitRadius
        ) {
          hitKart(racer.kart, racer.id, item, events);
          remove = true;
          break;
        }
      }
    }

    if (remove) {
      group.remove(missile.mesh);
      missiles.splice(index, 1);
    } else {
      const dx = missile.x - previousX;
      const dz = missile.z - previousZ;
      if (dx * dx + dz * dz > 1e-8) {
        missile.mesh.rotation.y = Math.atan2(dx, dz);
      }
      missile.mesh.position.set(missile.x, GROUND_Y + missile.y + 0.015, missile.z);
      flicker(missile);
    }
  }
}

/** Stretches the exhaust around the nozzle so the flame licks instead of standing still. */
function flicker(missile: Missile): void {
  if (!missile.flame) return;
  const t = missile.life * 31;
  const pulse = 0.88 + 0.12 * Math.sin(t) + 0.08 * Math.sin(t * 2.7 + 1.3);
  missile.flame.scale.set(1, 1, pulse);
  // Scale about the nozzle, not the model origin.
  missile.flame.position.z = NOZZLE_Z * (1 - pulse);
}

function updateWhiteMissile(
  dt: number,
  missile: Missile,
  collision: CollisionWorld,
): void {
  missile.x += missile.vx * dt;
  missile.z += missile.vz * dt;

  // Bounces off walls and obstacles instead of disappearing.
  const bottom = GROUND_Y + missile.y;
  for (const collider of collision.colliders) {
    if (verticallyClear(collider, bottom, bottom + MISSILE_HEIGHT)) continue;
    const hit = resolveCircleObb(
      missile.x,
      missile.z,
      ITEMS.missileRadius,
      collider,
    );
    if (!hit) {
      continue;
    }

    missile.x += hit.normal.x * hit.depth;
    missile.z += hit.normal.z * hit.depth;

    const normalVelocity = missile.vx * hit.normal.x + missile.vz * hit.normal.z;
    if (normalVelocity < 0) {
      missile.vx -= 2 * normalVelocity * hit.normal.x;
      missile.vz -= 2 * normalVelocity * hit.normal.z;
      missile.vx *= ITEMS.missileBounce;
      missile.vz *= ITEMS.missileBounce;
    }
    break;
  }
}

function updateRedMissile(
  dt: number,
  missile: Missile,
  racers: readonly ItemRacer[],
  track: TrackLike,
): void {
  const target = pickRedMissileTarget(missile, racers);
  const path = track.path;
  const pathCount = path.length;
  if (pathCount === 0) {
    return;
  }

  missile.pathProgress =
    (missile.pathProgress +
      (ITEMS.redMissileSpeed * dt) / track.pathSpacing) %
    pathCount;

  const baseFloat = missile.pathProgress;
  const base = Math.floor(baseFloat) % pathCount;
  const next = (base + 1) % pathCount;
  const fraction = baseFloat - Math.floor(baseFloat);
  const a = path[base];
  const b = path[next];
  const pathX = a.x + (b.x - a.x) * fraction;
  const pathZ = a.z + (b.z - a.z) * fraction;

  if (!target) {
    missile.x = pathX;
    missile.z = pathZ;
    return;
  }

  const dx = target.state.pos.x - missile.x;
  const dz = target.state.pos.z - missile.z;
  const distance = Math.hypot(dx, dz);

  // The last stretch homes directly so a kart at the edge of the road is
  // still hit; the rest of the flight follows the centerline.
  if (distance > 0.001 && distance <= ITEMS.redMissileDirectRange && sameLevel(missile.y, target)) {
    missile.x += (dx / distance) * ITEMS.redMissileSpeed * dt;
    missile.z += (dz / distance) * ITEMS.redMissileSpeed * dt;
  } else {
    missile.x = pathX;
    missile.z = pathZ;
  }
}

/**
 * Closest centerline point aligned with the shot. Where the track crosses
 * itself (overpass), the heading separates the deck from the lower road.
 */
function alignedPathIndex(track: TrackLike, x: number, z: number, yaw: number): number {
  let best = 0;
  let bestScore = Infinity;
  track.path.forEach((point, index) => {
    const misalignment = 1 - Math.cos(track.pathYaw(index) - yaw);
    const score = (point.x - x) ** 2 + (point.z - z) ** 2 + misalignment * 400;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

/**
 * Red missiles chase the nearest racer ahead. When the owner is already leading,
 * they fall back to the closest racer so a shot is never wasted.
 */
function pickRedMissileTarget(
  missile: Missile,
  racers: readonly ItemRacer[],
): Kart | undefined {
  const owner = racers.find((racer) => racer.id === missile.owner);
  const others = racers.filter((racer) => racer.id !== missile.owner);
  if (others.length === 0) {
    return undefined;
  }

  const ahead = owner
    ? others.filter((racer) => racer.rank < owner.rank)
    : [];
  if (ahead.length > 0) {
    return ahead.reduce((best, racer) =>
      racer.rank > best.rank ? racer : best,
    ).kart;
  }

  const nearest = others.reduce((best, racer) => {
    const bestDistance =
      (best.kart.state.pos.x - missile.x) ** 2 +
      (best.kart.state.pos.z - missile.z) ** 2;
    const distance =
      (racer.kart.state.pos.x - missile.x) ** 2 +
      (racer.kart.state.pos.z - missile.z) ** 2;
    return distance < bestDistance ? racer : best;
  });
  return nearest.kart;
}
