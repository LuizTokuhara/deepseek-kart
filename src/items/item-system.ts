import * as THREE from "three";
import { ITEMS } from "../config";
import type { CollisionWorld } from "../collision";
import type { Kart } from "../kart";
import type { TrackLike } from "../track";
import { spawnBanana, updateBananas, type Banana } from "./banana";
import {
  createItemBoxes,
  resetItemBoxes,
  tryPickup,
  updateItemBoxes,
  type ItemBox,
} from "./item-box";
import { useMushroom } from "./mushroom";
import { spawnShell, updateShells, type Shell } from "./shell";
import type { ItemEvent, ItemRacer, KartId } from "./item-types";

export class ItemSystem {
  readonly group = new THREE.Group();

  private readonly boxes: ItemBox[];
  private bananas: Banana[] = [];
  private shells: Shell[] = [];
  private events: ItemEvent[] = [];
  private elapsed = 0;
  private aiItemTimer = 0;

  constructor(
    private readonly track: TrackLike,
    private readonly collision: CollisionWorld,
  ) {
    this.boxes = createItemBoxes(track, this.group);
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
    resetItemBoxes(this.boxes);
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
      this.bananas.push(spawnBanana(kart, id, this.group));
    } else if (item === "shell" || item === "red-shell") {
      this.shells.push(spawnShell(kart, id, item, this.track, this.group));
    } else if (item === "mushroom") {
      useMushroom(kart);
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
    updateItemBoxes(this.boxes, dt, this.elapsed);

    const racers: ItemRacer[] = [
      { id: "player", kart: player },
      { id: "ai", kart: ai },
    ];

    tryPickup(this.boxes, player, "player", playerRank, this.events);
    if (aiActive) {
      tryPickup(
        this.boxes,
        ai,
        "ai",
        playerRank === 1 ? 2 : 1,
        this.events,
      );
    }
    this.updateAIItem(dt, ai, player, aiActive);
    updateBananas(this.bananas, dt, racers, this.group, this.events);
    updateShells(
      this.shells,
      dt,
      racers,
      this.track,
      this.collision,
      this.group,
      this.events,
    );
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
}
