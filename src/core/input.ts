import type { DriveInput } from "./types";

const PREVENT_DEFAULT = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "F3",
]);

export class Input {
  private readonly down = new Set<string>();
  private resetQueued = false;
  private itemQueued = false;
  private helpQueued = false;
  private debugQueued = false;

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  get drive(): DriveInput {
    const throttle = this.isDown("KeyW") || this.isDown("ArrowUp") ? 1 : 0;
    const brake = this.isDown("KeyS") || this.isDown("ArrowDown") ? 1 : 0;

    // +1 = esquerda (A), -1 = direita (D). O yaw positivo também gira para a
    // esquerda na convenção de câmera usada pelo jogo.
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
    } else if (event.code === "F3") {
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
