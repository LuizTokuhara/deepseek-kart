import { formatTime } from "./race";
import type { Surface } from "./types";

export interface RaceResultRow {
  name: string;
  time: string;
  isPlayer: boolean;
}

export interface RaceResultData {
  position: number;
  bestLap: number | null;
  lapTimes: readonly number[];
  standings: readonly RaceResultRow[];
}

export interface HudData {
  speedKmh: number;
  surface: Surface;
  vForward: number;
  vLateral: number;
  yaw: number;
  x: number;
  z: number;
  fps: number;
  ticks: number;
  drifting: boolean;
  driftTier: number;
  driftCharge: number;
  miniTurboTimer: number;
  miniTurboTier: number;
  lapLabel: string;
  positionLabel: string;
  raceTime: string;
  lastLap: string;
  bestLap: string;
  checkpointLabel: string;
  itemLabel: string;
  raceFinished: boolean;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element #${id} not found`);
  }
  return element as T;
}

function ordinal(position: number): string {
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${position}TH`;
  }

  switch (position % 10) {
    case 1:
      return `${position}ST`;
    case 2:
      return `${position}ND`;
    case 3:
      return `${position}RD`;
    default:
      return `${position}TH`;
  }
}

export class Hud {
  private readonly root = requiredElement<HTMLElement>("hud");
  private readonly help = requiredElement<HTMLElement>("help");
  private readonly speed = requiredElement<HTMLElement>("hud-speed");
  private readonly surface = requiredElement<HTMLElement>("hud-surface");
  private readonly velocity = requiredElement<HTMLElement>("hud-velocity");
  private readonly drift = requiredElement<HTMLElement>("hud-drift");
  private readonly driftFill = requiredElement<HTMLElement>("hud-drift-fill");
  private readonly yaw = requiredElement<HTMLElement>("hud-yaw");
  private readonly position = requiredElement<HTMLElement>("hud-position");
  private readonly fps = requiredElement<HTMLElement>("hud-fps");
  private readonly ticks = requiredElement<HTMLElement>("hud-ticks");
  private readonly toastElement = requiredElement<HTMLElement>("toast");
  private readonly raceRoot = requiredElement<HTMLElement>("race-hud");
  private readonly raceLap = requiredElement<HTMLElement>("race-lap");
  private readonly racePosition = requiredElement<HTMLElement>("race-pos");
  private readonly raceTime = requiredElement<HTMLElement>("race-time");
  private readonly raceLast = requiredElement<HTMLElement>("race-last");
  private readonly raceBest = requiredElement<HTMLElement>("race-best");
  private readonly raceCheckpoint = requiredElement<HTMLElement>("race-cp");
  private readonly raceItem = requiredElement<HTMLElement>("race-item");
  private readonly countdownRoot = requiredElement<HTMLElement>("countdown");
  private readonly countdownLabel = requiredElement<HTMLElement>("countdown-label");
  private readonly wrongWay = requiredElement<HTMLElement>("wrong-way");
  private readonly resultsRoot = requiredElement<HTMLElement>("results");
  private readonly resultsPosition =
    requiredElement<HTMLElement>("results-position");
  private readonly resultsBest = requiredElement<HTMLElement>("results-best");
  private readonly resultsStandings =
    requiredElement<HTMLElement>("results-standings");
  private readonly resultsLaps = requiredElement<HTMLElement>("results-laps");

  private toastTimer = 0;
  private countdownText: string | null = null;
  private wrongWayState = false;
  private resultsVisible = false;

  update(data: HudData): void {
    this.speed.textContent = Math.round(data.speedKmh).toString();
    this.surface.textContent = data.surface === "asphalt" ? "ASPHALT" : "GRASS";
    this.velocity.textContent = `${data.vForward.toFixed(1)} / ${data.vLateral.toFixed(1)}`;
    this.yaw.textContent = `${Math.round((data.yaw * 180) / Math.PI)}°`;
    this.position.textContent = `${Math.round(data.x)} / ${Math.round(data.z)}`;
    this.fps.textContent = Math.round(data.fps).toString();
    this.ticks.textContent = data.ticks.toString();

    this.raceLap.textContent = data.lapLabel;
    this.racePosition.textContent = data.positionLabel;
    this.raceTime.textContent = data.raceTime;
    this.raceLast.textContent = data.lastLap;
    this.raceBest.textContent = data.bestLap;
    this.raceCheckpoint.textContent = data.checkpointLabel;
    this.raceItem.textContent = data.itemLabel;
    this.raceRoot.classList.toggle("finished", data.raceFinished);

    if (data.miniTurboTimer > 0) {
      this.drift.textContent = `BOOST ${data.miniTurboTimer.toFixed(1)}s`;
      this.setDriftFill(1, Math.max(1, data.miniTurboTier));
    } else if (data.drifting) {
      const pct = Math.min(100, Math.round(data.driftCharge * 100));
      this.drift.textContent = `N${data.driftTier} · ${pct}%`;
      this.setDriftFill(data.driftCharge, Math.max(1, data.driftTier));
    } else {
      this.drift.textContent = "—";
      this.setDriftFill(0, 0);
    }
  }

  setCountdown(label: string | null): void {
    if (label === this.countdownText) {
      return;
    }

    this.countdownText = label;
    if (label === null) {
      this.countdownRoot.classList.add("hidden");
      return;
    }

    this.countdownRoot.classList.remove("hidden");
    this.countdownLabel.textContent = label;
    this.countdownLabel.classList.toggle("go", label === "GO!");

    // Reinicia a animação a cada número.
    this.countdownLabel.classList.remove("pop");
    void this.countdownLabel.offsetWidth;
    this.countdownLabel.classList.add("pop");
  }

  setWrongWay(active: boolean): void {
    if (active === this.wrongWayState) {
      return;
    }

    this.wrongWayState = active;
    this.wrongWay.classList.toggle("hidden", !active);
  }

  showResults(data: RaceResultData): void {
    this.resultsPosition.textContent = `${ordinal(data.position)} PLACE`;
    this.resultsPosition.classList.toggle("win", data.position === 1);
    this.resultsBest.textContent = formatTime(data.bestLap);

    const standings = data.standings.map((row, index) => {
      const element = document.createElement("div");
      element.className = row.isPlayer ? "results-row you" : "results-row";

      const rank = document.createElement("span");
      rank.className = "results-rank";
      rank.textContent = ordinal(index + 1);

      const name = document.createElement("span");
      name.className = "results-name";
      name.textContent = row.name;

      const time = document.createElement("span");
      time.className = "results-time";
      time.textContent = row.time;

      element.append(rank, name, time);
      return element;
    });
    this.resultsStandings.replaceChildren(...standings);

    const laps = data.lapTimes.map((time, index) => {
      const element = document.createElement("div");
      element.className = "results-lap-row";

      const label = document.createElement("span");
      label.textContent = `LAP ${index + 1}`;

      const value = document.createElement("b");
      value.textContent = formatTime(time);

      element.append(label, value);
      return element;
    });
    this.resultsLaps.replaceChildren(...laps);

    this.resultsRoot.classList.remove("hidden");
    this.resultsVisible = true;
  }

  hideResults(): void {
    if (!this.resultsVisible) {
      return;
    }
    this.resultsRoot.classList.add("hidden");
    this.resultsVisible = false;
  }

  private setDriftFill(charge: number, tier: number): void {
    this.driftFill.style.width = `${Math.round(charge * 100)}%`;
    this.driftFill.className = "drift-fill";
    if (tier > 0) {
      this.driftFill.classList.add(`tier-${Math.min(3, tier)}`);
    }
  }

  toggleDebug(): boolean {
    this.root.classList.toggle("hidden");
    return !this.root.classList.contains("hidden");
  }

  toggleHelp(): boolean {
    this.help.classList.toggle("hidden");
    return !this.help.classList.contains("hidden");
  }

  toast(message: string): void {
    this.toastElement.textContent = message;
    this.toastElement.classList.add("visible");

    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastElement.classList.remove("visible");
    }, 1400);
  }
}
