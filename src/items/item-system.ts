import * as THREE from "three";
import { ITEMS, PHYSICS } from "../core/config";
import type { CollisionWorld } from "../core/collision";
import type { Kart } from "../actors/kart/kart";
import type { TrackLike } from "../tracks/track";
import { spawnOilSlick, updateOilSlicks, type OilSlick } from "./oil-slick";
import {
  createItemBoxes,
  resetItemBoxes,
  tryPickup,
  updateItemBoxes,
  type ItemBox,
} from "./item-box";
import { useLightning } from "./lightning";
import { spawnMissile, updateMissiles, type Missile } from "./missile";
import type { ItemEvent, ItemRacer, KartId } from "./item-types";
import type { Difficulty } from "../race/difficulty";

export class ItemSystem {
  readonly group = new THREE.Group();

  private readonly boxes: ItemBox[];
  private oilSlicks: OilSlick[] = [];
  private missiles: Missile[] = [];
  private events: ItemEvent[] = [];
  private elapsed = 0;
  private difficulty: Difficulty = "hard";
  private readonly aiItemTimers = new Map<KartId, number>();

  constructor(
    private readonly track: TrackLike,
    private readonly collision: CollisionWorld,
  ) {
    this.boxes = createItemBoxes(track, this.group);
  }

  setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
  }

  reset(): void {
    for (const oilSlick of this.oilSlicks) {
      this.group.remove(oilSlick.mesh);
    }
    for (const missile of this.missiles) {
      this.group.remove(missile.mesh);
    }
    this.oilSlicks = [];
    this.missiles = [];
    this.events = [];
    this.elapsed = 0;
    this.aiItemTimers.clear();
    resetItemBoxes(this.boxes);
  }

  useItem(kart: Kart, id: KartId): boolean {
    const item = kart.state.item;
    if (!item || kart.state.spinTimer > 0 || kart.state.falling) {
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

    if (item === "oil-can") {
      this.oilSlicks.push(spawnOilSlick(kart, id, this.track, this.group));
    } else if (item === "missile" || item === "red-missile") {
      this.missiles.push(spawnMissile(kart, id, item, this.track, this.group));
    } else if (item === "lightning") {
      useLightning(kart);
    }

    return true;
  }

  /**
   * Compatibility with the two-kart scenario (player + AI). The game uses
   * `updateField` to update every racer at once.
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

    updateOilSlicks(this.oilSlicks, dt, racers, this.track, this.group, this.events);
    updateMissiles(
      this.missiles,
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

  get oilSlickCount(): number {
    return this.oilSlicks.length;
  }

  get missileCount(): number {
    return this.missiles.length;
  }

  get oilSlickPositions(): ReadonlyArray<{ x: number; z: number; y: number }> {
    return this.oilSlicks;
  }

  get missileProjectiles(): ReadonlyArray<{
    x: number;
    z: number;
    y: number;
    kind: "white" | "red";
  }> {
    return this.missiles;
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
    const useTime = this.aiTuning?.useTime ?? ITEMS.aiUseTime;
    if (heldFor < useTime) {
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

    const tuning = this.aiTuning;
    const missileRange = tuning?.missileRange ?? ITEMS.aiMissileRange;
    const missileAimDot = tuning?.missileAimDot ?? ITEMS.aiMissileAimDot;
    const oilDropDistance =
      tuning?.oilSlickDropDistance ?? ITEMS.aiOilSlickDropDistance;
    const oilBehindDot =
      tuning?.oilSlickBehindDot ?? ITEMS.aiOilSlickBehindDot;
    let missileTarget = false;
    let oilSlickTarget = false;

    for (const other of racers) {
      // Rivals on the other level (overpass or lower road) are not targets.
      if (
        other.id === racer.id ||
        Math.abs(other.kart.state.height - ai.state.height) > PHYSICS.levelGap
      ) {
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
        (item === "missile" || item === "red-missile") &&
        distance <= missileRange &&
        aim >= missileAimDot
      ) {
        missileTarget = true;
      }

      if (
        item === "oil-can" &&
        distance <= oilDropDistance &&
        aim <= oilBehindDot
      ) {
        oilSlickTarget = true;
      }
    }

    if (item === "oil-can") {
      return (
        oilSlickTarget ||
        heldFor >= (tuning?.oilSlickHoldTime ?? ITEMS.aiOilSlickHoldTime)
      );
    }

    if (item === "missile" || item === "red-missile") {
      return missileTarget;
    }

    if (item === "lightning") {
      const index = this.track.nearestPathIndex(
        ai.state.pos.x,
        ai.state.pos.z,
      );
      const turn = Math.abs(
        this.track.pathYawDelta(
          index,
          tuning?.lightningLookAhead ?? ITEMS.aiLightningLookAhead,
        ),
      );
      return turn <= (
        tuning?.lightningStraightAngle ?? ITEMS.aiLightningStraightAngle
      );
    }

    return false;
  }

  private get aiTuning(): typeof ITEMS.normalAI | null {
    return this.difficulty === "normal" ? ITEMS.normalAI : null;
  }
}
