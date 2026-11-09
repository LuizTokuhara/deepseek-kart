import type { DriveInput } from "./types";

const PREVENT_DEFAULT = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);

export class Input {
  private readonly down = new Set<string>();
  private resetQueued = false;
  private itemQueued = false;
  private helpQueued = false;
  private debugQueued = false;

  constructor(private enabled = true) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  get drive(): DriveInput {
    const throttle = this.isDown("KeyW") || this.isDown("ArrowUp") ? 1 : 0;
    const brake = this.isDown("KeyS") || this.isDown("ArrowDown") ? 1 : 0;

    // +1 = left (A), -1 = right (D). Positive yaw also turns left in the
    // camera convention used by the game.
    const left = this.isDown("KeyA") || this.isDown("ArrowLeft") ? 1 : 0;
    const right = this.isDown("KeyD") || this.isDown("ArrowRight") ? 1 : 0;
    const drift =
      this.isDown("Space") ||
      this.isDown("ShiftLeft") ||
      this.isDown("ShiftRight");

    return {
      throttle,
      brake,
      steer: left - right,
      drift,
    };
  }

  consumeReset(): boolean {
    return this.consume("resetQueued");
  }

  consumeItemUse(): boolean {
    return this.consume("itemQueued");
  }

  consumeHelp(): boolean {
    return this.consume("helpQueued");
  }

  consumeDebug(): boolean {
    return this.consume("debugQueued");
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.clearActions();
  }

  /** Drops queued actions but keeps keys that are still held. */
  clearQueuedActions(): void {
    this.resetQueued = false;
    this.itemQueued = false;
    this.helpQueued = false;
    this.debugQueued = false;
  }

  /** Discards actions and keys accumulated before the start. */
  clearActions(): void {
    this.down.clear();
    this.clearQueuedActions();
  }

  private isDown(code: string): boolean {
    return this.down.has(code);
  }

  private consume(
    flag: "resetQueued" | "itemQueued" | "helpQueued" | "debugQueued",
  ): boolean {
    const value = this[flag];
    this[flag] = false;
    return value;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    if (PREVENT_DEFAULT.has(event.code)) {
      event.preventDefault();
    }

    if (event.repeat) {
      return;
    }

    this.down.add(event.code);

    if (event.code === "KeyR") {
      this.resetQueued = true;
    } else if (event.code === "KeyE") {
      this.itemQueued = true;
    } else if (event.code === "KeyH") {
      this.helpQueued = true;
    } else if (event.code === "KeyT") {
      this.debugQueued = true;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.down.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.down.clear();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.down.clear();
    }
  };
}
