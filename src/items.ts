import * as THREE from "three";
import { GROUND_Y, ITEMS, TRACK } from "./config";
import { ITEM_BOX_MATERIAL } from "./item-box-visual";
import { createItemModel } from "./item-model";
import { resolveCircleObb, type CollisionWorld } from "./collision";
import type { Kart } from "./kart";
import type { Track } from "./track";
import type { ItemType } from "./types";

export type KartId = "player" | "ai";

export type ItemEvent =
  | { type: "pickup"; kart: KartId; item: ItemType; count: number }
  | { type: "use"; kart: KartId; item: ItemType; count: number }
  | { type: "hit"; kart: KartId; item: ItemType };

interface ItemRoll {
  item: ItemType;
  count: number;
}

interface ItemBox {
  x: number;
  z: number;
  mesh: THREE.Mesh;
  active: boolean;
  respawn: number;
}

interface Banana {
  x: number;
  z: number;
  mesh: THREE.Group;
  owner: KartId;
  ownerKart: Kart;
  life: number;
  immunity: number;
}

interface Shell {
  x: number;
  z: number;
  vx: number;
  vz: number;
  mesh: THREE.Group;
  owner: KartId;
  ownerKart: Kart;
  kind: "green" | "red";
  pathProgress: number;
  life: number;
  immunity: number;
}

const HIT_RADIUS = 0.65;

export function itemLabel(
  item: ItemType | null,
  count = 1,
): string {
  let label: string;
  switch (item) {
    case "banana":
      label = "BANANA";
      break;
    case "shell":
      label = "SHELL";
      break;
    case "red-shell":
      label = "RED SHELL";
      break;
    case "mushroom":
      label = "MUSHROOM";
      break;
    default:
      return "—";
  }
  return count > 1 ? `${label} ×${count}` : label;
}

export class ItemSystem {
  readonly group = new THREE.Group();

  private readonly boxes: ItemBox[] = [];
  private bananas: Banana[] = [];
  private shells: Shell[] = [];
  private events: ItemEvent[] = [];
  private elapsed = 0;
  private aiItemTimer = 0;

  private readonly boxGeometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  private readonly boxMaterial = ITEM_BOX_MATERIAL;

  constructor(
    private readonly track: Track,
    private readonly collision: CollisionWorld,
  ) {
    for (const spawn of track.itemBoxes) {
      const mesh = new THREE.Mesh(this.boxGeometry, this.boxMaterial);
      mesh.position.set(spawn.x, 0.75, spawn.z);
      mesh.rotation.set(0.14, 0, 0.18);
      this.group.add(mesh);
      this.boxes.push({
        x: spawn.x,
        z: spawn.z,
        mesh,
        active: true,
        respawn: 0,
      });
    }
  }

  reset(): void {
    for (const banana of this.bananas) {
      this.group.remove(banana.mesh);
    }
    for (const shell of this.shells) {
      this.group.remove(shell.mesh);
    }
    this.bananas = [];
    this.shells = [];
    this.events = [];
    this.elapsed = 0;
    this.aiItemTimer = 0;

    for (const box of this.boxes) {
      box.active = true;
      box.respawn = 0;
      box.mesh.visible = true;
    }
  }

  useItem(kart: Kart, id: KartId): boolean {
    const item = kart.state.item;
    if (!item || kart.state.spinTimer > 0) {
      return false;
    }

    const count = Math.max(1, kart.state.itemCount);
    if (count > 1) {
      kart.state.itemCount = count - 1;
    } else {
      kart.state.item = null;
      kart.state.itemCount = 0;
    }

    this.events.push({ type: "use", kart: id, item, count: 1 });

    if (item === "banana") {
      const forwardX = Math.sin(kart.state.yaw);
      const forwardZ = Math.cos(kart.state.yaw);
      const x = kart.state.pos.x - forwardX * 2.0;
      const z = kart.state.pos.z - forwardZ * 2.0;
      const mesh = createItemModel("banana");
      mesh.position.set(x, GROUND_Y + 0.01, z);
      mesh.rotation.y = kart.state.yaw + Math.PI;
      this.group.add(mesh);
      this.bananas.push({
        x,
        z,
        mesh,
        owner: id,
        ownerKart: kart,
        life: ITEMS.bananaLife,
        immunity: ITEMS.bananaOwnerImmunity,
      });
    } else if (item === "shell" || item === "red-shell") {
      const forwardX = Math.sin(kart.state.yaw);
      const forwardZ = Math.cos(kart.state.yaw);
      const red = item === "red-shell";
      const speed = red
        ? ITEMS.redShellSpeed
        : Math.max(ITEMS.shellSpeed, kart.speed * 1.2);
      const x = kart.state.pos.x + forwardX * 1.8;
      const z = kart.state.pos.z + forwardZ * 1.8;
      const mesh = createItemModel(item);
      mesh.position.set(x, GROUND_Y + 0.015, z);
      this.group.add(mesh);
      const pathIndex = red
        ? this.track.nearestPathIndex(x, z)
        : 0;
      this.shells.push({
        x,
        z,
        vx: forwardX * speed,
        vz: forwardZ * speed,
        mesh,
        owner: id,
        ownerKart: kart,
        kind: red ? "red" : "green",
        pathProgress: red ? pathIndex + 0.6 : 0,
        life: red ? ITEMS.redShellLife : ITEMS.shellLife,
        immunity: ITEMS.shellOwnerImmunity,
      });
    } else if (item === "mushroom") {
      kart.state.miniTurboTier = ITEMS.mushroomBoostTier;
      kart.state.miniTurboTimer = ITEMS.mushroomBoostTime;
    }

    return true;
  }

  update(
    dt: number,
    player: Kart,
    ai: Kart,
    playerRank: number,
    aiActive: boolean,
  ): void {
    this.elapsed += dt;
    this.updateBoxes(dt);
    this.tryPickup(player, "player", playerRank);
    if (aiActive) {
      this.tryPickup(ai, "ai", playerRank === 1 ? 2 : 1);
    }
    this.updateAIItem(dt, ai, player, aiActive);
    this.updateBananas(dt, player, ai);
    this.updateShells(dt, player, ai);
  }

  consumeEvents(): ItemEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  get bananaCount(): number {
    return this.bananas.length;
  }

  get shellCount(): number {
    return this.shells.length;
  }

  get bananaPositions(): ReadonlyArray<{ x: number; z: number }> {
    return this.bananas;
  }

  get shellProjectiles(): ReadonlyArray<{
    x: number;
    z: number;
    kind: "green" | "red";
  }> {
    return this.shells;
  }

  private updateBoxes(dt: number): void {
    for (let i = 0; i < this.boxes.length; i++) {
      const box = this.boxes[i];
      if (!box.active) {
        box.respawn -= dt;
        box.mesh.visible = false;
        if (box.respawn <= 0) {
          box.active = true;
          box.mesh.visible = true;
        }
        continue;
      }

      box.mesh.rotation.y += dt * 1.7;
      box.mesh.position.y = 0.75 + Math.sin(this.elapsed * 2.2 + i) * 0.05;
    }
  }

  private tryPickup(kart: Kart, id: KartId, rank: number): void {
    if (kart.state.item !== null || kart.state.spinTimer > 0) {
      return;
    }

    for (const box of this.boxes) {
      if (!box.active) {
        continue;
      }

      const dx = kart.state.pos.x - box.x;
      const dz = kart.state.pos.z - box.z;
      if (dx * dx + dz * dz > ITEMS.boxRadius * ITEMS.boxRadius) {
        continue;
      }

      const roll = this.rollItem(rank);
      kart.state.item = roll.item;
      kart.state.itemCount = roll.count;
      box.active = false;
      box.respawn = ITEMS.boxRespawn;
      box.mesh.visible = false;
      this.events.push({
        type: "pickup",
        kart: id,
        item: roll.item,
        count: roll.count,
      });
      return;
    }
  }

  private updateAIItem(
    dt: number,
    ai: Kart,
    player: Kart,
    aiActive: boolean,
  ): void {
    if (!aiActive || !ai.state.item || ai.state.spinTimer > 0) {
      this.aiItemTimer = 0;
      return;
    }

    this.aiItemTimer += dt;
    if (this.aiItemTimer < ITEMS.aiUseTime) {
      return;
    }

    if (!this.shouldAIUseItem(ai, player)) {
      return;
    }

    this.useItem(ai, "ai");
    this.aiItemTimer = 0;
  }

  private shouldAIUseItem(ai: Kart, player: Kart): boolean {
    const item = ai.state.item;
    if (!item) {
      return false;
    }

    const dx = player.state.pos.x - ai.state.pos.x;
    const dz = player.state.pos.z - ai.state.pos.z;
    const distance = Math.hypot(dx, dz);
    const forwardX = Math.sin(ai.state.yaw);
    const forwardZ = Math.cos(ai.state.yaw);
    const aim =
      distance > 0.001 ? (dx * forwardX + dz * forwardZ) / distance : 1;

    if (item === "banana") {
      const playerBehind =
        distance <= ITEMS.aiBananaDropDistance &&
        aim <= ITEMS.aiBananaBehindDot;
      return playerBehind || this.aiItemTimer >= ITEMS.aiBananaHoldTime;
    }

    if (item === "shell" || item === "red-shell") {
      return distance <= ITEMS.aiShellRange && aim >= ITEMS.aiShellAimDot;
    }

    if (item === "mushroom") {
      const index = this.track.nearestPathIndex(
        ai.state.pos.x,
        ai.state.pos.z,
      );
      const turn = Math.abs(
        this.track.pathYawDelta(index, ITEMS.aiMushroomLookAhead),
      );
      return turn <= ITEMS.aiMushroomStraightAngle;
    }

    return false;
  }

  private updateBananas(dt: number, player: Kart, ai: Kart): void {
    for (let i = this.bananas.length - 1; i >= 0; i--) {
      const banana = this.bananas[i];
      banana.life -= dt;
      banana.immunity -= dt;

      let hit = false;
      const hitRadius = ITEMS.bananaRadius + 0.6;

      if (
        player.state.spinTimer <= 0 &&
        (banana.owner !== "player" || banana.immunity <= 0) &&
        this.distanceSq(banana, player) <= hitRadius * hitRadius
      ) {
        this.hitKart(player, "player", "banana");
        hit = true;
      } else if (
        ai.state.spinTimer <= 0 &&
        (banana.owner !== "ai" || banana.immunity <= 0) &&
        this.distanceSq(banana, ai) <= hitRadius * hitRadius
      ) {
        this.hitKart(ai, "ai", "banana");
        hit = true;
      }

      if (hit || banana.life <= 0) {
        this.group.remove(banana.mesh);
        this.bananas.splice(i, 1);
      }
    }
  }

  private updateShells(dt: number, player: Kart, ai: Kart): void {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const shell = this.shells[i];
      shell.life -= dt;
      shell.immunity -= dt;

      if (shell.kind === "red") {
        this.updateRedShell(dt, shell, player, ai);
      } else {
        shell.x += shell.vx * dt;
        shell.z += shell.vz * dt;

        // Ricocheteia em paredes e obstáculos em vez de desaparecer.
        for (const collider of this.collision.colliders) {
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

          const normalVelocity =
            shell.vx * hit.normal.x + shell.vz * hit.normal.z;
          if (normalVelocity < 0) {
            shell.vx -= 2 * normalVelocity * hit.normal.x;
            shell.vz -= 2 * normalVelocity * hit.normal.z;
            shell.vx *= ITEMS.shellBounce;
            shell.vz *= ITEMS.shellBounce;
          }
          break;
        }
      }

      let remove = shell.life <= 0;

      // Só desaparece ao acertar um kart (ator).
      if (!remove) {
        const hitRadius = ITEMS.shellRadius + HIT_RADIUS;
        const item: ItemType = shell.kind === "red" ? "red-shell" : "shell";
        if (
          player.state.spinTimer <= 0 &&
          (shell.owner !== "player" || shell.immunity <= 0) &&
          this.distanceSq(shell, player) <= hitRadius * hitRadius
        ) {
          this.hitKart(player, "player", item);
          remove = true;
        } else if (
          ai.state.spinTimer <= 0 &&
          (shell.owner !== "ai" || shell.immunity <= 0) &&
          this.distanceSq(shell, ai) <= hitRadius * hitRadius
        ) {
          this.hitKart(ai, "ai", item);
          remove = true;
        }
      }

      if (remove) {
        this.group.remove(shell.mesh);
        this.shells.splice(i, 1);
      } else {
        shell.mesh.position.set(shell.x, GROUND_Y + 0.015, shell.z);
        shell.mesh.rotation.y += dt * 7;
      }
    }
  }

  private updateRedShell(
    dt: number,
    shell: Shell,
    player: Kart,
    ai: Kart,
  ): void {
    const target = shell.owner === "player" ? ai : player;
    const path = this.track.path;
    const pathCount = path.length;
    if (pathCount === 0) {
      return;
    }

    shell.pathProgress =
      (shell.pathProgress +
        (ITEMS.redShellSpeed * dt) / TRACK.sampleStep) %
      pathCount;

    const baseFloat = shell.pathProgress;
    const base = Math.floor(baseFloat) % pathCount;
    const next = (base + 1) % pathCount;
    const fraction = baseFloat - Math.floor(baseFloat);
    const a = path[base];
    const b = path[next];
    const pathX = a.x + (b.x - a.x) * fraction;
    const pathZ = a.z + (b.z - a.z) * fraction;

    const dx = target.state.pos.x - shell.x;
    const dz = target.state.pos.z - shell.z;
    const distance = Math.hypot(dx, dz);

    // The last stretch homes directly so a kart at the edge of the road is
    // still hit; the rest of the flight follows the centerline.
    if (distance > 0.001 && distance <= ITEMS.redShellDirectRange) {
      shell.x += (dx / distance) * ITEMS.redShellSpeed * dt;
      shell.z += (dz / distance) * ITEMS.redShellSpeed * dt;
    } else {
      shell.x = pathX;
      shell.z = pathZ;
    }
  }

  private hitKart(kart: Kart, id: KartId, item: ItemType): void {
    if (kart.state.spinTimer > 0) {
      return;
    }

    kart.state.vel.x *= ITEMS.hitSpeedScale;
    kart.state.vel.z *= ITEMS.hitSpeedScale;
    kart.state.spinTimer = ITEMS.spinTime;
    kart.state.drifting = false;
    kart.state.driftDirection = 0;
    kart.state.driftCharge = 0;
    kart.state.driftTier = 0;
    kart.state.miniTurboTimer = 0;
    kart.state.miniTurboTier = 0;
    this.events.push({ type: "hit", kart: id, item });
  }

  private rollItem(rank: number): ItemRoll {
    const table: ReadonlyArray<ItemRoll & { weight: number }> =
      rank <= 1
        ? [
            { item: "banana", count: 1, weight: 0.26 },
            { item: "banana", count: 3, weight: 0.12 },
            { item: "shell", count: 1, weight: 0.26 },
            { item: "shell", count: 3, weight: 0.12 },
            { item: "mushroom", count: 1, weight: 0.16 },
            { item: "red-shell", count: 1, weight: 0.08 },
          ]
        : [
            { item: "red-shell", count: 1, weight: 0.18 },
            { item: "red-shell", count: 3, weight: 0.18 },
            { item: "shell", count: 1, weight: 0.16 },
            { item: "shell", count: 3, weight: 0.14 },
            { item: "banana", count: 1, weight: 0.12 },
            { item: "banana", count: 3, weight: 0.1 },
            { item: "mushroom", count: 1, weight: 0.12 },
          ];

    let roll = Math.random();
    for (const entry of table) {
      if (roll < entry.weight) {
        return { item: entry.item, count: entry.count };
      }
      roll -= entry.weight;
    }
    const last = table[table.length - 1];
    return { item: last.item, count: last.count };
  }

  private distanceSq(
    a: { x: number; z: number },
    kart: Kart,
  ): number {
    const dx = a.x - kart.state.pos.x;
    const dz = a.z - kart.state.pos.z;
    return dx * dx + dz * dz;
  }
}
