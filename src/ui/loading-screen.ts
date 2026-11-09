function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element #${id} not found`);
  }
  return element as T;
}

/**
 * Full-screen boot overlay. It is visible from the first HTML paint, before
 * Three.js or any course module has loaded, then reports renderer init and
 * shader precompilation progress.
 */
export class LoadingScreen {
  private readonly root = requiredElement<HTMLElement>("loading-screen");
  private readonly fill = requiredElement<HTMLElement>("loading-fill");
  private readonly label = requiredElement<HTMLElement>("loading-label");
  private readonly percent = requiredElement<HTMLElement>("loading-percent");
  private readonly progress = requiredElement<HTMLElement>("loading-progress");
  private readonly hint = requiredElement<HTMLElement>("loading-hint");
  private hidden = false;

  set(progress: number, label: string): void {
    const value = Math.max(0, Math.min(1, progress));
    this.fill.style.transform = `scaleX(${value})`;
    this.percent.textContent = `${Math.round(value * 100)}%`;
    this.label.textContent = label;
    this.progress.setAttribute("aria-valuenow", String(Math.round(value * 100)));
    this.root.setAttribute("aria-busy", value >= 1 ? "false" : "true");
  }

  setBackend(backend: string): void {
    this.hint.textContent = `${backend.toUpperCase()} · PROCEDURAL ASSETS · NO DOWNLOADS`;
  }

  fail(message: string): void {
    this.root.classList.add("failed");
    this.root.setAttribute("aria-busy", "false");
    this.label.textContent = message;
    this.percent.textContent = "—";
    this.progress.setAttribute("aria-valuenow", "0");
  }

  hide(): void {
    if (this.hidden) return;
    this.hidden = true;
    document.body.classList.remove("booting");
    this.root.classList.add("leaving");
    this.root.setAttribute("aria-hidden", "true");
    this.root.inert = true;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320;
    window.setTimeout(() => this.root.remove(), delay);
  }
}
