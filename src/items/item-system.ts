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
  private readonly aiItemTimers = new Map<KartId, number>();

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
    this.aiItemTimers.clear();
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

  /**
   * Compatibilidade com o cenário de dois karts (jogador + IA). O jogo usa
   * `updateField` para atualizar todos os corredores de uma vez.
   */
  update(
    dt: number,
    player: Kart,
    ai: Kart,
    playerRank: number,
    aiActive: boolean,
  ): void {
    const aiRank = playerRank === 1 ? 2 : 1;
    this.updateField(
      dt,
      [
        {
          id: "player",
          kart: player,
          rank: playerRank,
          isPlayer: true,
          active: true,
        },
        {
          id: "ai",
          kart: ai,
          rank: aiRank,
          isPlayer: false,
          active: aiActive,
        },
      ],
      aiActive,
    );
  }

  updateField(
    dt: number,
    racers: readonly ItemRacer[],
    aiActive = true,
  ): void {
    this.elapsed += dt;
    updateItemBoxes(this.boxes, dt, this.elapsed);

    for (const racer of racers) {
      if (racer.active === false) {
        if (!racer.isPlayer) {
          this.aiItemTimers.delete(racer.id);
        }
        continue;
      }

      tryPickup(
        this.boxes,
        racer.kart,
        racer.id,
        racer.rank,
        this.events,
      );
    }

    if (aiActive) {
      for (const racer of racers) {
        if (racer.isPlayer) {
          this.aiItemTimers.delete(racer.id);
          continue;
        }
        if (racer.active === false) {
          this.aiItemTimers.delete(racer.id);
          continue;
        }
        this.updateAIItem(dt, racer, racers);
      }
    } else {
      this.aiItemTimers.clear();
    }

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
    racer: ItemRacer,
    racers: readonly ItemRacer[],
  ): void {
    const ai = racer.kart;
    if (!ai.state.item || ai.state.spinTimer > 0) {
      this.aiItemTimers.delete(racer.id);
      return;
    }

    const heldFor = (this.aiItemTimers.get(racer.id) ?? 0) + dt;
    this.aiItemTimers.set(racer.id, heldFor);
    if (heldFor < ITEMS.aiUseTime) {
      return;
    }

    if (!this.shouldAIUseItem(racer, racers, heldFor)) {
      return;
    }

    this.useItem(ai, racer.id);
    this.aiItemTimers.delete(racer.id);
  }

  private shouldAIUseItem(
    racer: ItemRacer,
    racers: readonly ItemRacer[],
    heldFor: number,
  ): boolean {
    const ai = racer.kart;
    const item = ai.state.item;
    if (!item) {
      return false;
    }

    let shellTarget = false;
    let bananaTarget = false;

    for (const other of racers) {
      if (other.id === racer.id) {
        continue;
      }

      const dx = other.kart.state.pos.x - ai.state.pos.x;
      const dz = other.kart.state.pos.z - ai.state.pos.z;
      const distance = Math.hypot(dx, dz);
      const forwardX = Math.sin(ai.state.yaw);
      const forwardZ = Math.cos(ai.state.yaw);
      const aim =
        distance > 0.001
          ? (dx * forwardX + dz * forwardZ) / distance
          : 1;

      if (
        (item === "shell" || item === "red-shell") &&
        distance <= ITEMS.aiShellRange &&
        aim >= ITEMS.aiShellAimDot
      ) {
        shellTarget = true;
      }

      if (
        item === "banana" &&
        distance <= ITEMS.aiBananaDropDistance &&
        aim <= ITEMS.aiBananaBehindDot
      ) {
        bananaTarget = true;
      }
    }

    if (item === "banana") {
      return bananaTarget || heldFor >= ITEMS.aiBananaHoldTime;
    }

    if (item === "shell" || item === "red-shell") {
      return shellTarget;
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
