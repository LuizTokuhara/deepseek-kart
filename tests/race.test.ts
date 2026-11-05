import { describe, expect, it } from "vitest";
import { formatTime, Race } from "../src/race";

const CONFIG = {
  checkpoints: [
    { x: 10, z: 0 },
    { x: 10, z: 10 },
    { x: 0, z: 10 },
  ],
  finish: { x: 0, z: 0 },
  radius: 1.5,
  laps: 3,
};

function updateAt(race: Race, x: number, z: number, speed = 1, dt = 0.1): void {
  race.update(dt, {
    pos: { x, z },
    vel: { x: speed, z: 0 },
  });
}

function hitLap(race: Race): void {
  updateAt(race, 10, 0);
  updateAt(race, 10, 10);
  updateAt(race, 0, 10);
  updateAt(race, 0, 0);
}

describe("race", () => {
  it("inicia o cronômetro no primeiro movimento", () => {
    const race = new Race(CONFIG);
    updateAt(race, 0, 0, 0);
    expect(race.state.started).toBe(false);
    expect(race.state.raceTime).toBe(0);

    updateAt(race, 0, 0, 1);
    expect(race.state.started).toBe(true);
    expect(race.state.raceTime).toBeCloseTo(0.1);
  });

  it("exige os checkpoints na ordem antes de contar a volta", () => {
    const race = new Race(CONFIG);
    updateAt(race, 0, 0);

    // Checkpoint 1 sem o 0 não conta.
    updateAt(race, 10, 10);
    expect(race.state.nextCheckpoint).toBe(0);

    updateAt(race, 10, 0);
    expect(race.state.nextCheckpoint).toBe(1);
    updateAt(race, 10, 10);
    expect(race.state.nextCheckpoint).toBe(2);
    updateAt(race, 0, 10);
    expect(race.state.nextCheckpoint).toBe(3);

    updateAt(race, 0, 0);
    expect(race.state.completedLaps).toBe(1);
    expect(race.state.lap).toBe(2);
    expect(race.state.nextCheckpoint).toBe(0);
    expect(race.state.lastLapTime).not.toBeNull();
    expect(race.state.bestLapTime).not.toBeNull();
  });

  it("termina após três voltas e congela o cronômetro", () => {
    const race = new Race(CONFIG);
    updateAt(race, 0, 0);

    hitLap(race);
    hitLap(race);
    hitLap(race);

    expect(race.state.finished).toBe(true);
    expect(race.state.completedLaps).toBe(3);
    expect(race.state.lap).toBe(3);

    const finalTime = race.state.raceTime;
    updateAt(race, 0, 0, 1, 1);
    expect(race.state.raceTime).toBe(finalTime);
  });

  it("formata tempos e reinicia o estado", () => {
    expect(formatTime(null)).toBe("--:--.---");
    expect(formatTime(0)).toBe("00:00.000");
    expect(formatTime(65.432)).toBe("01:05.432");

    const race = new Race(CONFIG);
    updateAt(race, 0, 0);
    hitLap(race);
    race.reset();

    expect(race.state.started).toBe(false);
    expect(race.state.completedLaps).toBe(0);
    expect(race.state.lap).toBe(1);
    expect(race.state.raceTime).toBe(0);
    expect(race.state.lastLapTime).toBeNull();
    expect(race.state.bestLapTime).toBeNull();
  });
});
