import * as THREE from "three";
import { GROUND_Y, ITEMS } from "../core/config";
import { resolveCircleObb, verticallyClear, type CollisionWorld } from "../core/collision";
import type { Kart } from "../actors/kart/kart";
import type { TrackLike } from "../tracks/track";
import { createItemModel } from "./item-model";
import { distanceToKartSq, hitKart, sameLevel } from "./item-hit";
import type { ItemEvent, ItemRacer, KartId } from "./item-types";

const HIT_RADIUS = 0.65;
/** Altura do casco, para ricochetear só nas paredes do próprio nível. */
const SHELL_HEIGHT = 0.6;

export interface Shell {
  x: number;
  z: number;
  /** Altura do chão sob o casco: segue rampas e fica no próprio nível. */
  y: number;
  vx: number;
  vz: number;
  mesh: THREE.Group;
  owner: KartId;
  kind: "green" | "red";
  pathProgress: number;
  life: number;
  immunity: number;
}

export function spawnShell(
  kart: Kart,
  owner: KartId,
  item: "shell" | "red-shell",
  track: TrackLike,
  group: THREE.Group,
): Shell {
  const forwardX = Math.sin(kart.state.yaw);
  const forwardZ = Math.cos(kart.state.yaw);
  const red = item === "red-shell";
  const speed = red
    ? ITEMS.redShellSpeed
    : Math.max(ITEMS.shellSpeed, kart.speed * 1.2);
  const x = kart.state.pos.x + forwardX * 1.8;
  const z = kart.state.pos.z + forwardZ * 1.8;
  const y = track.heightAt?.(x, z, kart.state.height) ?? 0;
  const mesh = createItemModel(red ? "red-shell" : "shell");
  mesh.position.set(x, GROUND_Y + y + 0.015, z);
  group.add(mesh);
  const pathIndex = red ? alignedPathIndex(track, x, z, kart.state.yaw) : 0;

  return {
    x,
    z,
    y,
    vx: forwardX * speed,
    vz: forwardZ * speed,
    mesh,
    owner,
    kind: red ? "red" : "green",
    pathProgress: red ? pathIndex + 0.6 : 0,
    life: red ? ITEMS.redShellLife : ITEMS.shellLife,
    immunity: ITEMS.shellOwnerImmunity,
  };
}

export function updateShells(
  shells: Shell[],
  dt: number,
  racers: readonly ItemRacer[],
  track: TrackLike,
  collision: CollisionWorld,
  group: THREE.Group,
  events: ItemEvent[],
): void {
  for (let index = shells.length - 1; index >= 0; index--) {
    const shell = shells[index];
    shell.life -= dt;
    shell.immunity -= dt;

    if (shell.kind === "red") {
      updateRedShell(dt, shell, racers, track);
    } else {
      updateGreenShell(dt, shell, collision);
    }
    shell.y = track.heightAt?.(shell.x, shell.z, shell.y) ?? 0;

    let remove = shell.life <= 0;

    // Só desaparece ao acertar um kart (ator).
    if (!remove) {
      const hitRadius = ITEMS.shellRadius + HIT_RADIUS;
      const item = shell.kind === "red" ? "red-shell" : "shell";

      for (const racer of racers) {
        if (
          racer.kart.state.spinTimer > 0 ||
          (shell.owner === racer.id && shell.immunity > 0)
        ) {
          continue;
        }

        if (
          sameLevel(shell.y, racer.kart) &&
          distanceToKartSq(shell, racer.kart) <= hitRadius * hitRadius
        ) {
          hitKart(racer.kart, racer.id, item, events);
          remove = true;
          break;
        }
      }
    }

    if (remove) {
      group.remove(shell.mesh);
      shells.splice(index, 1);
    } else {
      shell.mesh.position.set(shell.x, GROUND_Y + shell.y + 0.015, shell.z);
      shell.mesh.rotation.y += dt * 7;
    }
  }
}

function updateGreenShell(
  dt: number,
  shell: Shell,
  collision: CollisionWorld,
): void {
  shell.x += shell.vx * dt;
  shell.z += shell.vz * dt;

  // Ricocheteia em paredes e obstáculos em vez de desaparecer.
  const bottom = GROUND_Y + shell.y;
  for (const collider of collision.colliders) {
    if (verticallyClear(collider, bottom, bottom + SHELL_HEIGHT)) continue;
    const hit = resolveCircleObb(
      shell.x,
      shell.z,
      ITEMS.shellRadius,
      collider,
    );
    if (!hit) {
      continue;
    }

    shell.x += hit.normal.x * hit.depth;
    shell.z += hit.normal.z * hit.depth;

    const normalVelocity = shell.vx * hit.normal.x + shell.vz * hit.normal.z;
    if (normalVelocity < 0) {
      shell.vx -= 2 * normalVelocity * hit.normal.x;
      shell.vz -= 2 * normalVelocity * hit.normal.z;
      shell.vx *= ITEMS.shellBounce;
      shell.vz *= ITEMS.shellBounce;
    }
    break;
  }
}

function updateRedShell(
  dt: number,
  shell: Shell,
  racers: readonly ItemRacer[],
  track: TrackLike,
): void {
  const target = pickRedShellTarget(shell, racers);
  const path = track.path;
  const pathCount = path.length;
  if (pathCount === 0) {
    return;
  }

  shell.pathProgress =
    (shell.pathProgress +
      (ITEMS.redShellSpeed * dt) / track.pathSpacing) %
    pathCount;

  const baseFloat = shell.pathProgress;
  const base = Math.floor(baseFloat) % pathCount;
  const next = (base + 1) % pathCount;
  const fraction = baseFloat - Math.floor(baseFloat);
  const a = path[base];
  const b = path[next];
  const pathX = a.x + (b.x - a.x) * fraction;
  const pathZ = a.z + (b.z - a.z) * fraction;

  if (!target) {
    shell.x = pathX;
    shell.z = pathZ;
    return;
  }

  const dx = target.state.pos.x - shell.x;
  const dz = target.state.pos.z - shell.z;
  const distance = Math.hypot(dx, dz);

  // The last stretch homes directly so a kart at the edge of the road is
  // still hit; the rest of the flight follows the centerline.
  if (distance > 0.001 && distance <= ITEMS.redShellDirectRange && sameLevel(shell.y, target)) {
    shell.x += (dx / distance) * ITEMS.redShellSpeed * dt;
    shell.z += (dz / distance) * ITEMS.redShellSpeed * dt;
  } else {
    shell.x = pathX;
    shell.z = pathZ;
  }
}

/**
 * Ponto da centerline mais próximo e alinhado com o disparo. Onde a pista se
 * cruza (viaduto), o rumo separa o tabuleiro da estrada de baixo.
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
 * Red shells chase the nearest racer ahead. When the owner is already leading,
 * they fall back to the closest racer so a shot is never wasted.
 */
function pickRedShellTarget(
  shell: Shell,
  racers: readonly ItemRacer[],
): Kart | undefined {
  const owner = racers.find((racer) => racer.id === shell.owner);
  const others = racers.filter((racer) => racer.id !== shell.owner);
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
      (best.kart.state.pos.x - shell.x) ** 2 +
      (best.kart.state.pos.z - shell.z) ** 2;
    const distance =
      (racer.kart.state.pos.x - shell.x) ** 2 +
      (racer.kart.state.pos.z - shell.z) ** 2;
    return distance < bestDistance ? racer : best;
  });
  return nearest.kart;
}
