import { RACE } from "../core/config";
import type { Surface } from "../core/types";
import { DEFAULT_DIFFICULTY, type Difficulty } from "../race/difficulty";
import type { CourseDefinition } from "../tracks/course";
import type { TitleLogoView } from "./title-logo-view";

const DIFFICULTY_STORAGE_KEY = "deepseek-kart-difficulty";

function loadDifficulty(): Difficulty {
  try {
    return globalThis.localStorage?.getItem(DIFFICULTY_STORAGE_KEY) === "hard"
      ? "hard"
      : DEFAULT_DIFFICULTY;
  } catch {
    return DEFAULT_DIFFICULTY;
  }
}

function storeDifficulty(difficulty: Difficulty): void {
  try {
    globalThis.localStorage?.setItem(DIFFICULTY_STORAGE_KEY, difficulty);
  } catch {
    // The preference is optional; the game keeps working without local storage.
  }
}

const SURFACE_LABEL: Record<Surface, string> = {
  asphalt: "ASPHALT",
  dirt: "DIRT",
  grass: "GRASS",
  ice: "ICE",
  sand: "SAND",
  stone: "STONE",
};

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element #${id} not found`);
  }
  return element as T;
}

/**
 * Start screen over the starting-grid scene. The race only receives its first tick
 * after the button or Enter, so the countdown does not start hidden.
 */
export class StartScreen {
  private readonly root = requiredElement<HTMLElement>("start-screen");
  private readonly button = requiredElement<HTMLButtonElement>("start-button");
  private readonly trackName = requiredElement<HTMLElement>("start-track-name");
  private readonly trackMeta = requiredElement<HTMLElement>("start-track-meta");
  private readonly help = requiredElement<HTMLDetailsElement>("start-help");
  private readonly difficultyButtons: HTMLButtonElement[];
  private readonly background: { element: HTMLElement; inert: boolean }[] = [];
  private difficulty: Difficulty = DEFAULT_DIFFICULTY;
  private started = false;
  private hideTimer = 0;
  private logo: TitleLogoView | null = null;

  constructor(
    course: CourseDefinition,
    private readonly onStart: (difficulty: Difficulty) => void,
    courses: readonly CourseDefinition[] = [course],
    logo: Promise<TitleLogoView | null> = Promise.resolve(null),
  ) {
    // The static markup starts inert so it cannot steal focus behind the
    // loading overlay; it becomes interactive once the renderer is ready.
    this.root.inert = false;
    this.difficultyButtons = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>("[data-difficulty]"),
    );
    this.setDifficulty(loadDifficulty(), false);
    for (const button of this.difficultyButtons) {
      button.addEventListener("click", () => {
        this.setDifficulty(
          button.dataset.difficulty === "hard" ? "hard" : "normal",
        );
      });
    }
    this.trackName.textContent = course.layout.name;
    const hasStone = course.layout.surfaceZones?.some(
      (zone) => zone.surface === "stone",
    );
    this.trackMeta.textContent = [
      `${SURFACE_LABEL[course.layout.surface]}${hasStone ? " + STONE" : ""}`,
      `${RACE.laps} LAPS`,
      `${RACE.opponents + 1} KARTS`,
    ].join(" · ");

    this.showCircuit(course, courses);
    for (const sibling of document.body.children) {
      if (sibling instanceof HTMLElement && sibling !== this.root) {
        this.background.push({ element: sibling, inert: sibling.inert });
        sibling.inert = true;
      }
    }
    document.body.classList.add("start-screen-open");
    this.button.addEventListener("click", this.begin);
    this.help.addEventListener("toggle", this.onHelpToggle);
    window.addEventListener("keydown", this.onKeyDown);
    requestAnimationFrame(() => {
      if (!this.started) this.button.focus({ preventScroll: true });
    });
    // The 3D logo replaces the HTML brand once ready; the HTML stays as fallback.
    void logo.then((view) => {
      if (!view) return;
      this.logo = view;
      view.attach(requiredElement("start-logo-slot"));
      requiredElement("start-brand").classList.add("has-3d-logo");
      if (!this.started) view.play();
    });
  }

  /** Reopens the track select after the results screen closes. */
  show(): void {
    if (!this.started) {
      return;
    }

    window.clearTimeout(this.hideTimer);
    this.started = false;
    this.root.classList.remove("hidden", "leaving");
    this.root.inert = false;
    this.root.removeAttribute("aria-hidden");
    this.root.scrollTop = 0;
    this.button.disabled = false;
    this.help.open = false;
    for (const { element } of this.background) {
      element.inert = true;
    }
    document.body.classList.add("start-screen-open");
    this.button.addEventListener("click", this.begin);
    this.help.addEventListener("toggle", this.onHelpToggle);
    window.addEventListener("keydown", this.onKeyDown);
    requestAnimationFrame(() => {
      if (!this.started) this.button.focus({ preventScroll: true });
    });
    this.logo?.play();
  }

  private showCircuit(course: CourseDefinition, courses: readonly CourseDefinition[]): void {
    const index = Math.max(0, courses.findIndex(candidate => candidate.layout.id === course.layout.id));
    requiredElement("start-track-number").textContent =
      `${String(index + 1).padStart(2, "0")} / ${String(courses.length).padStart(2, "0")}`;
    const nextLink = requiredElement<HTMLAnchorElement>("start-next-track");
    const next = courses[(index + 1) % courses.length];
    nextLink.hidden = courses.length < 2;
    if (next) {
      const url = new URL(window.location.href);
      url.searchParams.set("track", next.layout.id);
      nextLink.href = url.href;
      nextLink.setAttribute("aria-label", `Change track to ${next.layout.name}`);
      requiredElement("start-next-track-label").textContent = `NEXT: ${next.layout.name}`;
    }
    // Derive the preview from the actual course instead of maintaining another map.
    const points = course.layout.curve.getSpacedPoints(100);
    const xs = points.map(p => p.x), zs = points.map(p => p.z);
    const minX = Math.min(...xs), minZ = Math.min(...zs);
    const width = Math.max(...xs) - minX, depth = Math.max(...zs) - minZ;
    const scale = Math.min(160 / Math.max(width, 1), 76 / Math.max(depth, 1));
    const project = (p: { x: number; z: number }) => ({
      x: (p.x - minX - width / 2) * scale + 90,
      y: (p.z - minZ - depth / 2) * scale + 48,
    });
    const path = points.map((p, i) => {
      const v = project(p);
      return `${i ? "L" : "M"}${v.x.toFixed(2)},${v.y.toFixed(2)}`;
    }).join(" ") + " Z";
    document.getElementById("start-map-border")!.setAttribute("d", path);
    document.getElementById("start-map-path")!.setAttribute("d", path);
    const spawn = project(course.layout.curve.getPointAt(course.layout.spawnT));
    document.getElementById("start-map-grid")!.setAttribute("cx", String(spawn.x));
    document.getElementById("start-map-grid")!.setAttribute("cy", String(spawn.y));
  }

  private readonly onHelpToggle = (): void => {
    if (!this.help.open) return;
    requestAnimationFrame(() => {
      if (this.help.open && !this.started) {
        this.help.scrollIntoView({ block: "end", inline: "nearest", behavior: "auto" });
      }
    });
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.started || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === "Tab") {
      const controls = Array.from(this.root.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], summary',
      )).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
      return;
    }
    if (event.code === "KeyH" || (event.code === "Escape" && this.help.open)) {
      event.preventDefault();
      this.help.open = event.code === "Escape" ? false : !this.help.open;
      requiredElement("start-help-toggle").focus({ preventScroll: true });
      return;
    }
    // Let links, buttons and the help disclosure keep native Enter/Space behavior.
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("a, summary, button, input, select, textarea")) return;
    const confirms = event.code === "Enter" || event.code === "NumpadEnter" || event.code === "Space";
    if (confirms) {
      event.preventDefault();
      this.begin();
    }
  };

  private setDifficulty(difficulty: Difficulty, persist = true): void {
    this.difficulty = difficulty;
    for (const button of this.difficultyButtons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.difficulty === difficulty),
      );
    }
    if (persist) {
      storeDifficulty(difficulty);
    }
  }

  private readonly begin = (): void => {
    if (this.started) {
      return;
    }

    this.started = true;
    window.removeEventListener("keydown", this.onKeyDown);
    this.button.removeEventListener("click", this.begin);
    this.help.removeEventListener("toggle", this.onHelpToggle);
    this.button.disabled = true;
    this.root.classList.add("leaving");
    for (const { element, inert } of this.background) element.inert = inert;
    const canvas = document.querySelector<HTMLCanvasElement>("#app canvas");
    if (canvas) {
      canvas.tabIndex = -1;
      canvas.focus({ preventScroll: true });
    }
    this.root.inert = true;
    this.root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("start-screen-open");
    this.logo?.stop();
    this.onStart(this.difficulty);

    this.hideTimer = window.setTimeout(() => {
      this.root.classList.add("hidden");
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
  };
}
