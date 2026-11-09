import { AIDriver } from "./kart/ai";
import type { CollisionWorld } from "../core/collision";
import { RACE } from "../core/config";
import { HeldItemDisplay } from "../items";
import { Kart } from "./kart/kart";
import {
  AI_PALETTES,
  KartModel,
  PLAYER_PALETTE,
  type KartPalette,
} from "./kart/kart-model";
import { Race } from "../race/race";
import type { TrackLike } from "../tracks/track";
import type { Spawn, Vec2 } from "../core/types";

export interface Racer {
  readonly id: string;
  readonly name: string;
  readonly isPlayer: boolean;
  readonly color: string;
  readonly palette: KartPalette;
  readonly kart: Kart;
  readonly race: Race;
  readonly model: KartModel;
  readonly heldItems: HeldItemDisplay;
  readonly driver: AIDriver | null;
  readonly spawn: Spawn;
  readonly paceBias: number;
  readonly previousPosition: Vec2;
  previousYaw: number;
  /** Current race position, 1 = leader. Recomputed every tick. */
  rank: number;
}

interface GridSlot {
  readonly lateral: number;
  readonly forward: number;
}

interface AISetup {
  readonly palette: KartPalette;
  readonly laneOffset: number;
  readonly paceBias: number;
}

/**
 * Staggered grid behind the start line. The player keeps the original solo
 * spawn; rivals occupy two columns ahead, matching the old red CPU position.
 */
const STARTING_GRID: readonly GridSlot[] = [
  { lateral: 0, forward: 0 },
  { lateral: 3, forward: 4.5 },
  { lateral: -3, forward: 4.5 },
  { lateral: 3, forward: 9 },
  { lateral: -3, forward: 9 },
];

const AI_SETUPS: readonly AISetup[] = [
  { palette: AI_PALETTES[0], laneOffset: 2.5, paceBias: 1.0 },
  { palette: AI_PALETTES[1], laneOffset: -1.7, paceBias: 1.005 },
  { palette: AI_PALETTES[2], laneOffset: 0.9, paceBias: 1.015 },
  { palette: AI_PALETTES[3], laneOffset: 4.0, paceBias: 1.025 },
];

function colorHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function gridSpawn(base: Spawn, slot: GridSlot): Spawn {
  const forwardX = Math.sin(base.yaw);
  const forwardZ = Math.cos(base.yaw);
  const rightX = -Math.cos(base.yaw);
  const rightZ = Math.sin(base.yaw);
  return {
    pos: {
      x: base.pos.x + forwardX * slot.forward + rightX * slot.lateral,
      z: base.pos.z + forwardZ * slot.forward + rightZ * slot.lateral,
    },
    yaw: base.yaw,
  };
}

function createRace(track: TrackLike): Race {
  return new Race({
    checkpoints: track.checkpoints,
    finish: track.finishLine,
    radius: track.checkpointRadius,
    laps: RACE.laps,
  });
}

function createRacer(
  id: string,
  name: string,
  palette: KartPalette,
  spawn: Spawn,
  track: TrackLike,
  collision: CollisionWorld,
  paceBias: number,
  driver: AIDriver | null,
): Racer {
  const model = new KartModel(palette);
  const heldItems = new HeldItemDisplay();
  model.group.add(heldItems.group);

  return {
    id,
    name,
    isPlayer: driver === null,
    color: colorHex(palette.body),
    palette,
    kart: new Kart(spawn, track, collision),
    race: createRace(track),
    model,
    heldItems,
    driver,
    spawn,
    paceBias,
    previousPosition: { x: spawn.pos.x, z: spawn.pos.z },
    previousYaw: spawn.yaw,
    rank: 1,
  };
}

/**
 * Builds the player plus the requested number of CPU rivals. The grid and
 * liveries are deterministic so races and visual tests are reproducible.
 */
export function createRacers(
  track: TrackLike,
  collision: CollisionWorld,
  opponents = RACE.opponents,
): Racer[] {
  const count = Math.max(
    0,
    Math.min(opponents, AI_SETUPS.length, STARTING_GRID.length - 1),
  );
  const playerSpawn = gridSpawn(track.spawn, STARTING_GRID[0]);
  const racers: Racer[] = [
    createRacer(
      "player",
      "YOU",
      PLAYER_PALETTE,
      playerSpawn,
      track,
      collision,
      1,
      null,
    ),
  ];

  for (let index = 0; index < count; index++) {
    const setup = AI_SETUPS[index];
    const spawn = gridSpawn(track.spawn, STARTING_GRID[index + 1]);
    const driver = new AIDriver(track, setup.laneOffset);
    racers.push(
      createRacer(
        `ai-${index + 1}`,
        `CPU ${index + 1}`,
        setup.palette,
        spawn,
        track,
        collision,
        setup.paceBias,
        driver,
      ),
    );
  }

  return racers;
}
