import { describe, expect, it } from "vitest";
import type { RaceState } from "../src/race";
import { progressScore } from "../src/ranking";

const CHECKPOINTS = [
  { x: 10, z: 0 },
  { x: 10, z: 10 },
  { x: 0, z: 10 },
];
const FINISH = { x: 0, z: 0 };

function state(overrides: Partial<RaceState> = {}): RaceState {
  return {
    started: true,
    finished: false,
    lap: 1,
    totalLaps: 3,
    completedLaps: 0,
    raceTime: 0,
    lapTime: 0,
    lastLapTime: null,
    bestLapTime: null,
    nextCheckpoint: 0,
    ...overrides,
  };
}

describe("ranking", () => {
  it("ordena quem terminou pelo menor tempo", () => {
    const early = progressScore(
      state({ finished: true, raceTime: 30 }),
      { x: 0, z: 0 },
      CHECKPOINTS,
      FINISH,
    );
    const late = progressScore(
      state({ finished: true, raceTime: 50 }),
      { x: 0, z: 0 },
      CHECKPOINTS,
      FINISH,
    );

    expect(early).toBeGreaterThan(late);
  });

  it("volta completa vale mais que todos os checkpoints da volta anterior", () => {
    const lapTwo = progressScore(
      state({ completedLaps: 1, lap: 2, nextCheckpoint: 0 }),
      { x: 10, z: 0 },
      CHECKPOINTS,
      FINISH,
    );
    const lapOneAllCheckpoints = progressScore(
      state({ completedLaps: 0, nextCheckpoint: 3 }),
      { x: 0, z: 0 },
      CHECKPOINTS,
      FINISH,
    );

    expect(lapTwo).toBeGreaterThan(lapOneAllCheckpoints);
  });

  it("no mesmo checkpoint, quem está mais perto do próximo gate fica à frente", () => {
    const closer = progressScore(
      state({ nextCheckpoint: 1 }),
      { x: 10, z: 8 },
      CHECKPOINTS,
      FINISH,
    );
    const farther = progressScore(
      state({ nextCheckpoint: 1 }),
      { x: 10, z: 1 },
      CHECKPOINTS,
      FINISH,
    );

    expect(closer).toBeGreaterThan(farther);
  });
});
