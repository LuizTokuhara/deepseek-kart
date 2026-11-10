function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element #${id} not found`);
  }
  return element as T;
}

const MODIFIER_KEY = /^(Shift|Control|Alt|Meta)(Left|Right)?$/;

/**
 * Opening cinematic overlay and title card. While the film plays, any key or
 * click jumps to the title; START (button, Enter or Space) hands off to the
 * track select.
 */
export class TitleScreen {
  private readonly root = requiredElement<HTMLElement>("title-screen");
  private readonly button = requiredElement<HTMLButtonElement>("title-start");
  private revealed = false;
  private finished = false;
  private skipArmed = false;
  private startArmed = false;
  private filmTimer = 0;

  /** `filmSeconds` of cinematic before the title; 0 shows the title at once. */
  constructor(
    private readonly onStart: () => void,
    filmSeconds: number,
  ) {
    this.root.classList.remove("hidden");
    this.root.inert = false;
    this.button.addEventListener("click", this.start);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("pointerdown", this.onPointerDown);
    if (filmSeconds > 0) {
      document.body.classList.add("cinematic");
      this.filmTimer = window.setTimeout(this.reveal, filmSeconds * 1000);
      // Ignore the gesture still in flight from the loading screen.
      requestAnimationFrame(() => {
        this.skipArmed = true;
      });
    } else {
      this.reveal();
    }
  }

  private readonly reveal = (): void => {
    if (this.revealed) {
      return;
    }

    this.revealed = true;
    window.clearTimeout(this.filmTimer);
    document.body.classList.remove("cinematic");
    document.body.classList.add("title-open");
    this.button.disabled = false;
    // The key or click that skipped the film must not also press START.
    requestAnimationFrame(() => {
      this.startArmed = true;
      if (!this.finished) this.button.focus({ preventScroll: true });
    });
  };

  private readonly start = (): void => {
    if (!this.startArmed || this.finished) {
      return;
    }

    this.finished = true;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("pointerdown", this.onPointerDown);
    this.button.removeEventListener("click", this.start);
    this.button.disabled = true;
    document.body.classList.remove("cinematic", "title-open");
    this.root.classList.add("hidden");
    this.root.inert = true;
    this.onStart();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || MODIFIER_KEY.test(event.code)) {
      return;
    }
    if (!this.revealed) {
      if (this.skipArmed) {
        event.preventDefault();
        this.reveal();
      }
      return;
    }
    const target = event.target;
    if (target === this.button) return; // Native button activation handles it.
    if (event.code === "Enter" || event.code === "NumpadEnter" || event.code === "Space") {
      event.preventDefault();
      this.start();
    }
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.revealed && this.skipArmed && event.button === 0) {
      this.reveal();
    }
  };
}
