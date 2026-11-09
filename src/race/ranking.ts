import type { RaceGate, RaceState } from "./race";

/**
 * Progress score for ranking. The higher it is, the further ahead.
 * Laps count more than checkpoints, which count more than the distance
 * to the next gate. Racers who finished are ordered by lowest time.
 */
export function progressScore(
  state: RaceState,
  pos: { x: number; z: number },
  checkpoints: readonly RaceGate[],
  finish: RaceGate,
): number {
  if (state.finished) {
    return 1_000_000_000 - state.raceTime;
  }

  const gate =
    state.nextCheckpoint < checkpoints.length
      ? checkpoints[state.nextCheckpoint]
      : finish;
  const distance = Math.hypot(pos.x - gate.x, pos.z - gate.z);

  return state.completedLaps * 100000 + state.nextCheckpoint * 1000 - distance;
}
