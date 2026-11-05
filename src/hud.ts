import { formatTime } from "./race";
import type { TrackPathPoint } from "./track";
import type { ItemType, Surface } from "./types";

export interface RaceResultRow {
  name: string;
  time: string;
  isPlayer: boolean;
  color?: string;
}

export interface HudStanding {
  name: string;
  color: string;
  isPlayer: boolean;
}

export interface HudRival {
  x: number;
  z: number;
  yaw: number;
  color: string;
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
  rivals: readonly HudRival[];
  standings: readonly HudStanding[];
  fps: number;
  ticks: number;
  drifting: boolean;
  driftTier: number;
  driftCharge: number;
  miniTurboTimer: number;
  miniTurboTier: number;
  lapLabel: string;
  position: number;
  totalRacers: number;
  raceTime: string;
  lastLap: string;
  bestLap: string;
  checkpointLabel: string;
  item: ItemType | null;
  itemCount: number;
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

function shellIcon(color: string, seam: string): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="45" rx="24" ry="9" fill="#ffebbc" stroke="#202129" stroke-width="2.5" />
    <path d="M8 39C8 23 18 12 32 12s24 11 24 27c-10 8-38 8-48 0Z" fill="${color}" stroke="#202129" stroke-width="2.6" />
    <path d="m25 15 14 1 7 10-8 9-16-2-5-9Zm0 0-6-1m20 2 6 1m1 9 10 5M38 35l3 9m-19-11-4 10m-1-19-8 7" fill="none" stroke="${seam}" stroke-width="2.2" stroke-linejoin="round" />
    <path d="M7 38c14 9 36 9 50 0v6c-13 10-37 10-50 0Z" fill="#fff1ca" stroke="#202129" stroke-width="2.4" />
  </svg>`;
}

const ITEM_ICONS: Record<ItemType, string> = {
  banana: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M30 32C23 36 20 50 9 51c-4 0-5-3-5-6 6 4 10-7 15-14 3-5 7-4 11 1Z" fill="#e9ba2c" stroke="#3c2b20" stroke-width="2.4" />
    <path d="M35 30c8 1 11 14 19 17 5 2 7-1 7-4 2 8-3 13-10 10-11-5-13-13-16-23Z" fill="#ffdf4f" stroke="#3c2b20" stroke-width="2.4" />
    <path d="M29 8c-5 8-6 15-5 24-2 8-5 15-11 20-1 3 4 6 9 4 9-3 13-11 15-22 2-11-1-21-5-26Z" fill="#ffe44f" stroke="#3c2b20" stroke-width="2.4" stroke-linejoin="round" />
    <path d="m30 9 2-5 3 1-2 5" fill="#87602c" stroke="#3c2b20" stroke-width="2" />
    <ellipse cx="28" cy="24" rx="1.8" ry="3.3" fill="#202129" /><ellipse cx="34" cy="24" rx="1.8" ry="3.3" fill="#202129" />
    <path d="M28 32q3 4 6 0" fill="none" stroke="#202129" stroke-width="1.8" stroke-linecap="round" />
  </svg>`,
  shell: shellIcon("#35c862", "#195837"),
  "red-shell": shellIcon("#f05245", "#7c2d32"),
  mushroom: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M22 33h20l1 16c0 7-5 10-11 10s-11-3-11-10Z" fill="#ffeac1" stroke="#202129" stroke-width="2.5" />
    <path d="M7 34C7 19 18 9 32 9s25 10 25 25c0 8-50 8-50 0Z" fill="#ef4b42" stroke="#202129" stroke-width="2.5" />
    <ellipse cx="32" cy="15" rx="7" ry="4.5" fill="#fff5dd" />
    <ellipse cx="15" cy="29" rx="5" ry="7" fill="#fff5dd" transform="rotate(24 15 29)" />
    <ellipse cx="46" cy="28" rx="6.5" ry="7" fill="#fff5dd" transform="rotate(-18 46 28)" />
    <ellipse cx="28" cy="46" rx="1.9" ry="4.2" fill="#202129" /><ellipse cx="36" cy="46" rx="1.9" ry="4.2" fill="#202129" />
  </svg>`,
};

const EMPTY_ITEM_ICON = `
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="20" fill="none" stroke="rgba(148, 163, 184, 0.4)"
      stroke-width="2.5" stroke-dasharray="5 6" />
    <text x="32" y="41" text-anchor="middle" font-family="ui-monospace, monospace"
      font-size="26" font-weight="700" fill="rgba(148, 163, 184, 0.55)">?</text>
  </svg>`;

export class Hud {
  private readonly root = requiredElement<HTMLElement>("hud");
  private readonly help = requiredElement<HTMLElement>("help");
  private readonly itemHud = requiredElement<HTMLElement>("item-hud");
  private readonly itemIcon = requiredElement<HTMLElement>("item-icon");
  private readonly itemName = requiredElement<HTMLElement>("item-name");
  private readonly itemCount = requiredElement<HTMLElement>("item-count");
  private readonly surface = requiredElement<HTMLElement>("hud-surface");
  private readonly velocity = requiredElement<HTMLElement>("hud-velocity");
  private readonly speed = requiredElement<HTMLElement>("hud-speed");
  private readonly speedFill = requiredElement<HTMLElement>("hud-speed-fill");
  private readonly speedSegments = document.querySelectorAll<SVGPolygonElement>(".speed-segment");
  private readonly drift = requiredElement<HTMLElement>("hud-drift");
  private readonly driftFill = requiredElement<HTMLElement>("hud-drift-fill");
  private readonly yaw = requiredElement<HTMLElement>("hud-yaw");
  private readonly position = requiredElement<HTMLElement>("hud-position");
  private readonly fps = requiredElement<HTMLElement>("hud-fps");
  private readonly ticks = requiredElement<HTMLElement>("hud-ticks");
  private readonly toastElement = requiredElement<HTMLElement>("toast");
  private readonly raceRoot = requiredElement<HTMLElement>("race-hud");
  private readonly raceLap = requiredElement<HTMLElement>("race-lap");
  private readonly raceLapTotal = requiredElement<HTMLElement>("race-lap-total");
  private readonly racePosition = requiredElement<HTMLElement>("race-pos");
  private readonly racePositionTotal =
    requiredElement<HTMLElement>("race-pos-total");
  private readonly raceTime = requiredElement<HTMLElement>("race-time");
  private readonly raceLast = requiredElement<HTMLElement>("race-last");
  private readonly raceBest = requiredElement<HTMLElement>("race-best");
  private readonly raceCheckpoint = requiredElement<HTMLElement>("race-cp");
  private readonly standings = requiredElement<HTMLOListElement>("race-standings");
  private readonly minimapCanvas =
    requiredElement<HTMLCanvasElement>("minimap-canvas");
  private readonly minimapContext = this.minimapCanvas.getContext("2d");
  private readonly speedVignette =
    requiredElement<HTMLElement>("speed-vignette");
  private readonly damageFlash = requiredElement<HTMLElement>("damage-flash");
  private readonly countdownRoot = requiredElement<HTMLElement>("countdown");
  private readonly countdownLabel = requiredElement<HTMLElement>("countdown-label");
  private readonly wrongWay = requiredElement<HTMLElement>("wrong-way");
  private readonly resultsRoot = requiredElement<HTMLDialogElement>("results");
  private readonly resultsRestart = requiredElement<HTMLButtonElement>("results-restart");
  private readonly resultsTotal = requiredElement<HTMLElement>("results-total");
  private readonly resultsPosition =
    requiredElement<HTMLElement>("results-position");
  private readonly resultsBest = requiredElement<HTMLElement>("results-best");
  private readonly resultsStandings =
    requiredElement<HTMLElement>("results-standings");
  private readonly resultsLaps = requiredElement<HTMLElement>("results-laps");

  private trackPath: readonly TrackPathPoint[] = [];
  private finishLine: Readonly<TrackPathPoint> = { x: 0, z: 0 };
  private finishMapAngle = 0;
  private renderedItem: ItemType | null | undefined = undefined;
  private renderedPosition = 0;
  private renderedStandings = "";
  private readonly timeDigits: HTMLSpanElement[] = [];

  private toastTimer = 0;
  private countdownText: string | null = null;
  private wrongWayState = false;
  private resultsVisible = false;

  constructor(onRestart: () => void) {
    this.setItem(null, 0, "—");
    this.setRaceTime("00:00.000");
    this.resultsRestart.addEventListener("click", onRestart);
    this.resultsRoot.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.hideResults();
    });
  }

  setTrack(
    path: readonly TrackPathPoint[],
    finishLine: Readonly<TrackPathPoint>,
  ): void {
    this.trackPath = path;
    this.finishLine = { ...finishLine };
    if (path.length < 2) return;
    let closest = 0;
    let distance = Infinity;
    path.forEach((point, index) => {
      const squared = (point.x - finishLine.x) ** 2 + (point.z - finishLine.z) ** 2;
      if (squared < distance) { closest = index; distance = squared; }
    });
    const before = path[(closest - 1 + path.length) % path.length];
    const after = path[(closest + 1) % path.length];
    this.finishMapAngle = Math.atan2(after.x - before.x, -(after.z - before.z));
  }

  update(data: HudData): void {
    this.speed.textContent = Math.round(data.speedKmh).toString();
    this.surface.textContent =
      data.surface === "asphalt"
        ? "ASPHALT"
        : data.surface === "dirt"
          ? "DIRT"
          : "GRASS";
    this.velocity.textContent = `${data.vForward.toFixed(1)} / ${data.vLateral.toFixed(1)}`;
    this.yaw.textContent = `${Math.round((data.yaw * 180) / Math.PI)}°`;
    this.position.textContent = `${Math.round(data.x)} / ${Math.round(data.z)}`;
    this.fps.textContent = Math.round(data.fps).toString();
    this.ticks.textContent = data.ticks.toString();

    this.setItem(data.item, data.itemCount, data.itemLabel);
    const [lap, totalLaps] = data.lapLabel.split("/");
    this.raceLap.textContent = lap;
    this.raceLapTotal.textContent = totalLaps ? `/${totalLaps}` : "";
    this.raceLap.classList.toggle("finish", data.raceFinished);
    this.setPosition(data.position);
    this.renderStandings(data.standings);
    this.racePositionTotal.textContent = `/${data.totalRacers}`;
    this.racePosition.setAttribute("aria-label", `Position ${data.position} of ${data.totalRacers}`);
    this.setRaceTime(data.raceTime);
    this.raceLast.textContent = data.lastLap;
    this.raceBest.textContent = data.bestLap;
    this.raceCheckpoint.textContent = data.checkpointLabel;
    this.raceRoot.classList.toggle("finished", data.raceFinished);

    const speedIntensity = Math.max(
      0,
      Math.min(1, (data.speedKmh - 45) / 40),
    );
    this.speedVignette.style.opacity = (
      speedIntensity * 0.42
    ).toFixed(3);

    const speedRatio = Math.max(0, Math.min(1, data.speedKmh / 110));
    this.speedSegments.forEach((segment, index) => {
      segment.classList.toggle("lit", speedRatio >= (index + 0.5) / this.speedSegments.length);
    });
    this.speedFill.classList.toggle("boosting", data.miniTurboTimer > 0);
    this.drift.parentElement?.classList.toggle("active", data.drifting || data.miniTurboTimer > 0);

    if (data.miniTurboTimer > 0) {
      this.drift.textContent = `BOOST ${data.miniTurboTimer.toFixed(1)}s`;
      this.drift.classList.add("boost");
      this.setDriftFill(1, Math.max(1, data.miniTurboTier));
    } else if (data.drifting) {
      const pct = Math.min(100, Math.round(data.driftCharge * 100));
      this.drift.textContent = `N${data.driftTier} · ${pct}%`;
      this.drift.classList.remove("boost");
      this.setDriftFill(data.driftCharge, Math.max(1, data.driftTier));
    } else {
      this.drift.textContent = "DRIFT";
      this.drift.classList.remove("boost");
      this.setDriftFill(0, 0);
    }

    this.drawMinimap(data);
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

  flashDamage(): void {
    this.damageFlash.classList.remove("active");
    void this.damageFlash.offsetWidth;
    this.damageFlash.classList.add("active");
  }

  setWrongWay(active: boolean): void {
    if (active === this.wrongWayState) {
      return;
    }

    this.wrongWayState = active;
    this.wrongWay.classList.toggle("hidden", !active);
  }

  showResults(data: RaceResultData): void {
    const placeNumber = document.createElement("span");
    placeNumber.className = "results-place-number";
    placeNumber.textContent = data.position.toString();
    const placeSuffix = document.createElement("span");
    placeSuffix.className = "results-place-suffix";
    placeSuffix.textContent = ordinal(data.position).slice(placeNumber.textContent.length).toLowerCase();
    this.resultsPosition.replaceChildren(placeNumber, placeSuffix);
    this.resultsPosition.setAttribute("aria-label", `${ordinal(data.position)} place`);
    this.resultsPosition.classList.toggle("win", data.position === 1);
    this.resultsBest.textContent = formatTime(data.bestLap).replace(".", ":");
    const player = data.standings.find(row => row.isPlayer);
    this.resultsTotal.textContent = (player?.time ?? "--:--.---").replace(".", ":");

    const standings = data.standings.map((row, index) => {
      const element = document.createElement("div");
      element.className = row.isPlayer ? "results-row you player" : "results-row rival";

      const rank = document.createElement("span");
      rank.className = "results-rank";
      rank.textContent = ordinal(index + 1);

      const portrait = document.createElement("span");
      portrait.className = "racer-portrait results-portrait";
      portrait.setAttribute("aria-hidden", "true");
      if (row.color) {
        portrait.style.color = row.color;
      }
      portrait.innerHTML = '<svg viewBox="0 0 80 80"><use href="#kart-portrait" /></svg>';

      const name = document.createElement("span");
      name.className = "results-name";
      name.textContent = row.name;

      const time = document.createElement("span");
      time.className = "results-time";
      time.textContent = row.time.replace(".", ":");

      element.append(rank, portrait, name, time);
      return element;
    });
    this.resultsStandings.replaceChildren(...standings);

    const laps = data.lapTimes.map((time, index) => {
      const element = document.createElement("div");
      element.className = "results-lap-row";
      const isBest = data.bestLap !== null && Math.abs(time - data.bestLap) < 0.0005;
      element.classList.toggle("is-best", isBest);

      const label = document.createElement("span");
      label.textContent = `LAP ${index + 1}`;

      const best = document.createElement("span");
      best.className = "results-lap-badge";
      best.textContent = isBest ? "BEST" : "";

      const value = document.createElement("b");
      value.textContent = formatTime(time).replace(".", ":");

      element.append(label, best, value);
      return element;
    });
    this.resultsLaps.replaceChildren(...laps);

    this.resultsRoot.classList.remove("hidden");
    if (!this.resultsRoot.open) this.resultsRoot.showModal();
    this.resultsRestart.focus({ preventScroll: true });
    this.resultsVisible = true;
  }

  hideResults(): void {
    if (!this.resultsVisible) {
      return;
    }
    this.resultsRoot.close();
    this.resultsRoot.classList.add("hidden");
    this.resultsVisible = false;
  }

  private setItem(
    item: ItemType | null,
    count: number,
    label: string,
  ): void {
    if (item !== this.renderedItem) {
      this.itemIcon.innerHTML = item ? ITEM_ICONS[item] : EMPTY_ITEM_ICON;
      this.itemIcon.classList.toggle("empty", item === null);
      this.renderedItem = item;
    }

    const name = item ? label.replace(/\s×\d+$/, "") : "NO ITEM";
    this.itemName.textContent = name;
    this.itemCount.textContent = `×${count}`;
    this.itemCount.classList.toggle("hidden", item === null || count <= 1);
    this.itemHud.classList.toggle("empty", item === null);
    this.itemHud.setAttribute(
      "aria-label",
      item ? `Current item: ${name}${count > 1 ? `, ${count} charges` : ""}` : "No item",
    );
  }

  private setRaceTime(time: string): void {
    const value = time.replace(".", ":");
    // Bungee has proportional digits even with tabular-nums enabled.
    // Keep each character in its own fixed-width cell, including on reset.
    if (this.timeDigits.length !== value.length) {
      this.timeDigits.length = 0;
      for (const character of value) {
        const digit = document.createElement("span");
        digit.className = character === ":" ? "time-separator" : "time-digit";
        digit.textContent = character;
        this.timeDigits.push(digit);
      }
      this.raceTime.replaceChildren(...this.timeDigits);
    }
    this.timeDigits.forEach((digit, index) => {
      if (digit.textContent !== value[index]) digit.textContent = value[index];
    });
    this.raceTime.setAttribute("aria-label", time);
  }

  private setPosition(position: number): void {
    if (position === this.renderedPosition) return;
    this.renderedPosition = position;
    const number = document.createElement("span");
    number.className = "place-number";
    number.textContent = position.toString();
    const suffix = document.createElement("span");
    suffix.className = "place-suffix";
    suffix.textContent = ordinal(position).slice(number.textContent.length).toLowerCase();
    this.racePosition.replaceChildren(number, suffix);
    this.racePosition.dataset.position = position.toString();
  }

  private renderStandings(rows: readonly HudStanding[]): void {
    const key = rows
      .map((row) => `${row.name}:${row.isPlayer}:${row.color}`)
      .join("|");
    if (key === this.renderedStandings) {
      return;
    }
    this.renderedStandings = key;

    const elements = rows.map((row, index) => {
      const element = document.createElement("li");
      element.className = row.isPlayer ? "standing player" : "standing rival";

      const number = document.createElement("span");
      number.className = "standing-number";
      number.textContent = (index + 1).toString();

      const portrait = document.createElement("div");
      portrait.className = "racer-portrait";
      portrait.setAttribute("aria-hidden", "true");
      portrait.style.color = row.color;
      portrait.innerHTML =
        '<svg aria-hidden="true"><use href="#kart-portrait" /></svg>';

      const label = document.createElement("span");
      label.className = "racer-label";
      label.textContent = row.name;

      element.append(number, portrait, label);
      return element;
    });

    this.standings.replaceChildren(...elements);
  }

  private setDriftFill(charge: number, tier: number): void {
    this.driftFill.style.width = `${Math.round(charge * 100)}%`;
    this.driftFill.className = "drift-fill";
    if (tier > 0) {
      this.driftFill.classList.add(`tier-${Math.min(3, tier)}`);
    }
  }

  private drawMinimap(data: HudData): void {
    const context = this.minimapContext;
    const path = this.trackPath;
    if (!context || path.length === 0) return;
    const width = this.minimapCanvas.width;
    const height = this.minimapCanvas.height;
    context.clearRect(0, 0, width, height);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const point of path) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
    // Turn the course a quarter turn to fit the narrow right-hand HUD.
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const scale = Math.min((width - 112) / spanZ, (height - 112) / spanX);
    const offsetX = (width - spanZ * scale) / 2;
    const offsetY = (height - spanX * scale) / 2;
    const mapX = (z: number): number => offsetX + (maxZ - z) * scale;
    const mapY = (x: number): number => offsetY + (x - minX) * scale;
    const trace = (): void => {
      context.beginPath();
      path.forEach((point, index) => {
        if (index === 0) context.moveTo(mapX(point.z), mapY(point.x));
        else context.lineTo(mapX(point.z), mapY(point.x));
      });
      context.closePath();
    };
    context.lineJoin = "round";
    context.lineCap = "round";
    for (const [color, thickness] of [
      ["rgba(25, 27, 32, 0.65)", 22],
      ["rgba(241, 237, 216, 0.83)", 15],
      ["rgba(255, 253, 235, 0.6)", 5],
    ] as const) {
      trace();
      context.strokeStyle = color;
      context.lineWidth = thickness;
      context.stroke();
    }
    context.save();
    context.translate(mapX(this.finishLine.z), mapY(this.finishLine.x));
    context.rotate(this.finishMapAngle);
    context.fillStyle = "#fff9e1";
    context.fillRect(-4, -13, 8, 26);
    context.strokeStyle = "#292a2e";
    context.lineWidth = 2;
    context.strokeRect(-4, -13, 8, 26);
    context.restore();
    for (const rival of data.rivals) {
      this.drawMinimapMarker(
        context,
        mapX(rival.z),
        mapY(rival.x),
        rival.yaw,
        rival.color,
        null,
      );
    }
    this.drawMinimapMarker(context, mapX(data.z), mapY(data.x), data.yaw, "#55dfec", data.position);
  }

  private drawMinimapMarker(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    yaw: number,
    color: string,
    position: number | null,
  ): void {
    context.save();
    context.translate(x, y);
    context.beginPath();
    context.arc(0, 0, position !== null ? 24 : 21, 0, Math.PI * 2);
    context.fillStyle = "#fff8df";
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = "#202127";
    context.stroke();
    context.rotate(Math.PI / 2 - yaw);
    context.fillStyle = "#202127";
    context.fillRect(-18, -11, 7, 11);
    context.fillRect(11, -11, 7, 11);
    context.fillRect(-18, 7, 7, 11);
    context.fillRect(11, 7, 7, 11);
    context.fillStyle = color;
    context.fillRect(-12, -16, 24, 34);
    context.fillStyle = "#26334a";
    context.fillRect(-8, -10, 16, 13);
    context.fillStyle = "#fff8df";
    context.fillRect(-2, 5, 4, 11);
    context.restore();
    if (position !== null) {
      context.save();
      context.beginPath();
      context.moveTo(x - 12, y - 18);
      context.lineTo(x - 27, y - 33);
      context.lineTo(x - 42, y - 33);
      context.strokeStyle = "#17191e";
      context.lineWidth = 8;
      context.stroke();
      context.strokeStyle = "#f15e53";
      context.lineWidth = 4;
      context.stroke();
      context.font = '28px Bungee, "Arial Black", sans-serif';
      context.lineWidth = 6;
      context.strokeStyle = "#17191e";
      context.fillStyle = "#ff6d61";
      const label = `P${position}`;
      context.strokeText(label, x - 48, y - 40);
      context.fillText(label, x - 48, y - 40);
      context.restore();
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
