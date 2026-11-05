import { RACE } from "../core/config";
import type { Surface } from "../core/types";
import type { CourseDefinition } from "../tracks/course";

const SURFACE_LABEL: Record<Surface, string> = {
  asphalt: "ASPHALT",
  dirt: "DIRT",
  grass: "GRASS",
};

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element #${id} not found`);
  }
  return element as T;
}

/**
 * Tela inicial sobre a cena da largada. A corrida só recebe o primeiro tick
 * depois do botão ou de Enter, para o countdown não começar escondido.
 */
export class StartScreen {
  private readonly root = requiredElement<HTMLElement>("start-screen");
  private readonly button = requiredElement<HTMLButtonElement>("start-button");
  private readonly trackName = requiredElement<HTMLElement>("start-track-name");
  private readonly trackMeta = requiredElement<HTMLElement>("start-track-meta");
  private readonly help = requiredElement<HTMLDetailsElement>("start-help");
  private readonly background: { element: HTMLElement; inert: boolean }[] = [];
  private started = false;

  constructor(
    course: CourseDefinition,
    private readonly onStart: () => void,
    courses: readonly CourseDefinition[] = [course],
  ) {
    this.trackName.textContent = course.layout.name;
    this.trackMeta.textContent = [
      SURFACE_LABEL[course.layout.surface],
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
    // Let links and the help disclosure keep their native Enter/Space behavior.
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("a, summary, input, select, textarea")) return;
    const confirms = event.code === "Enter" || event.code === "NumpadEnter" || event.code === "Space";
    if (confirms) {
      event.preventDefault();
      this.begin();
    }
  };

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
    this.onStart();

    window.setTimeout(() => {
      this.root.classList.add("hidden");
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
  };
}
