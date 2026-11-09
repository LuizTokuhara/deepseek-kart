import type { KartState } from "../core/types";

export interface RaceGate {
  x: number;
  z: number;
}

export interface RaceConfig {
  checkpoints: readonly RaceGate[];
  finish: RaceGate;
  radius: number;
  laps: number;
}

export interface RaceState {
  started: boolean;
  finished: boolean;
  lap: number;
  totalLaps: number;
  completedLaps: number;
  raceTime: number;
  lapTime: number;
  lastLapTime: number | null;
  bestLapTime: number | null;
  lapTimes: number[];
  nextCheckpoint: number;
}

export type RaceEvent =
  | { type: "start" }
  | { type: "checkpoint"; index: number; count: number }
  | {
      type: "lap";
      lap: number;
      totalLaps: number;
      lapTime: number;
      raceTime: number;
    }
  | {
      type: "finish";
      totalLaps: number;
      raceTime: number;
      lastLapTime: number;
      bestLapTime: number;
    };

/**
 * The race also ends when every rival has finished, so an idle player cannot
 * leave a dead race running forever. The player is classified as last/DNF.
 */
export function allRivalsFinished(
  playerFinished: boolean,
  rivalFinished: readonly boolean[],
): boolean {
  return (
    !playerFinished &&
    rivalFinished.length > 0 &&
    rivalFinished.every(Boolean)
  );
}

export function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "--:--.---";
  }

  const totalMs = Math.max(0, Math.floor(seconds * 1000));
  const minutes = Math.floor(totalMs / 60000)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(totalMs / 1000) % 60;
  const ms = totalMs % 1000;

  return `${minutes}:${secs.toString().padStart(2, "0")}.${ms
    .toString()
    .padStart(3, "0")}`;
}

export class Race {
  readonly state: RaceState;

  private readonly config: RaceConfig;
  private readonly radiusSq: number;
  private pendingEvent: RaceEvent | null = null;

  constructor(config: RaceConfig) {
    this.config = config;
    this.radiusSq = config.radius * config.radius;

    this.state = {
      started: false,
      finished: false,
      lap: 1,
      totalLaps: config.laps,
      completedLaps: 0,
      raceTime: 0,
      lapTime: 0,
      lastLapTime: null,
      bestLapTime: null,
      lapTimes: [],
      nextCheckpoint: 0,
    };
  }

  get checkpointCount(): number {
    return this.config.checkpoints.length;
  }

  reset(): void {
    this.state.started = false;
    this.state.finished = false;
    this.state.lap = 1;
    this.state.completedLaps = 0;
    this.state.raceTime = 0;
    this.state.lapTime = 0;
    this.state.lastLapTime = null;
    this.state.bestLapTime = null;
    this.state.lapTimes.length = 0;
    this.state.nextCheckpoint = 0;
    this.pendingEvent = null;
  }

  /** Starts the timer explicitly, used on the countdown GO. */
  start(): void {
    if (this.state.started || this.state.finished) {
      return;
    }
    this.state.started = true;
    this.pendingEvent = { type: "start" };
  }

  update(dt: number, kart: Pick<KartState, "pos" | "vel">): void {
    if (this.state.finished) {
      return;
    }

    if (!this.state.started) {
      if (Math.hypot(kart.vel.x, kart.vel.z) < 0.5) {
        return;
      }
      this.start();
    }

    this.state.raceTime += dt;
    this.state.lapTime += dt;

    if (this.state.nextCheckpoint < this.config.checkpoints.length) {
      const gate = this.config.checkpoints[this.state.nextCheckpoint];
      if (this.atGate(kart.pos, gate)) {
        const index = this.state.nextCheckpoint;
        this.state.nextCheckpoint++;
        this.pendingEvent = {
          type: "checkpoint",
          index,
          count: this.config.checkpoints.length,
        };
      }
      return;
    }

    if (this.atGate(kart.pos, this.config.finish)) {
      this.completeLap();
    }
  }

  consumeEvent(): RaceEvent | null {
    const event = this.pendingEvent;
    this.pendingEvent = null;
    return event;
  }

  private completeLap(): void {
    const lapTime = this.state.lapTime;
    this.state.lapTimes.push(lapTime);
    this.state.lastLapTime = lapTime;
    this.state.bestLapTime =
      this.state.bestLapTime === null
        ? lapTime
        : Math.min(this.state.bestLapTime, lapTime);
    this.state.completedLaps++;

    if (this.state.completedLaps >= this.state.totalLaps) {
      this.state.finished = true;
      this.state.lap = this.state.totalLaps;
      this.state.nextCheckpoint = this.config.checkpoints.length;
      this.state.lapTime = 0;
      this.pendingEvent = {
        type: "finish",
        totalLaps: this.state.totalLaps,
        raceTime: this.state.raceTime,
        lastLapTime: lapTime,
        bestLapTime: this.state.bestLapTime,
      };
      return;
    }

    this.state.lap = this.state.completedLaps + 1;
    this.state.nextCheckpoint = 0;
    this.state.lapTime = 0;
    this.pendingEvent = {
      type: "lap",
      lap: this.state.lap,
      totalLaps: this.state.totalLaps,
      lapTime,
      raceTime: this.state.raceTime,
    };
  }

  private atGate(pos: { x: number; z: number }, gate: RaceGate): boolean {
    const dx = pos.x - gate.x;
    const dz = pos.z - gate.z;
    return dx * dx + dz * dz <= this.radiusSq;
  }
}
