import type { Surface } from "./types";

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
  raceTime: string;
  lastLap: string;
  bestLap: string;
  checkpointLabel: string;
  raceFinished: boolean;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Elemento #${id} não encontrado`);
  }
  return element as T;
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
  private readonly raceTime = requiredElement<HTMLElement>("race-time");
  private readonly raceLast = requiredElement<HTMLElement>("race-last");
  private readonly raceBest = requiredElement<HTMLElement>("race-best");
  private readonly raceCheckpoint = requiredElement<HTMLElement>("race-cp");

  private toastTimer = 0;

  update(data: HudData): void {
    this.speed.textContent = Math.round(data.speedKmh).toString();
    this.surface.textContent = data.surface === "asphalt" ? "ASFALTO" : "GRAMA";
    this.velocity.textContent = `${data.vForward.toFixed(1)} / ${data.vLateral.toFixed(1)}`;
    this.yaw.textContent = `${Math.round((data.yaw * 180) / Math.PI)}°`;
    this.position.textContent = `${Math.round(data.x)} / ${Math.round(data.z)}`;
    this.fps.textContent = Math.round(data.fps).toString();
    this.ticks.textContent = data.ticks.toString();

    this.raceLap.textContent = data.lapLabel;
    this.raceTime.textContent = data.raceTime;
    this.raceLast.textContent = data.lastLap;
    this.raceBest.textContent = data.bestLap;
    this.raceCheckpoint.textContent = data.checkpointLabel;
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
