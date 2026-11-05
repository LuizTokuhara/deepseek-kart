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
  private readonly yaw = requiredElement<HTMLElement>("hud-yaw");
  private readonly position = requiredElement<HTMLElement>("hud-position");
  private readonly fps = requiredElement<HTMLElement>("hud-fps");
  private readonly ticks = requiredElement<HTMLElement>("hud-ticks");
  private readonly toastElement = requiredElement<HTMLElement>("toast");

  private toastTimer = 0;

  update(data: HudData): void {
    this.speed.textContent = Math.round(data.speedKmh).toString();
    this.surface.textContent = data.surface === "asphalt" ? "ASFALTO" : "GRAMA";
    this.velocity.textContent = `${data.vForward.toFixed(1)} / ${data.vLateral.toFixed(1)}`;
    this.yaw.textContent = `${Math.round((data.yaw * 180) / Math.PI)}°`;
    this.position.textContent = `${Math.round(data.x)} / ${Math.round(data.z)}`;
    this.fps.textContent = Math.round(data.fps).toString();
    this.ticks.textContent = data.ticks.toString();
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
