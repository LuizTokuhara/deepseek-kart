import type { RaceGate, RaceState } from "./race";

/**
 * Score de progresso para ranking. Quanto maior, mais à frente.
 * Voltam contam mais que checkpoints, que contam mais que a distância
 * até o próximo gate. Quem terminou é ordenado pelo menor tempo.
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
