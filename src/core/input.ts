import type { DriveInput } from "./types";

const PREVENT_DEFAULT = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);

export type TouchDriveControl = "throttle" | "brake" | "drift";

export class Input {
  private readonly down = new Set<string>();
  private readonly touch = {
    throttle: false,
    brake: false,
    drift: false,
  };
  private tiltSteer = 0;
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
    const throttle =
      this.isDown("KeyW") || this.isDown("ArrowUp") || this.touch.throttle ? 1 : 0;
    const brake =
      this.isDown("KeyS") || this.isDown("ArrowDown") || this.touch.brake ? 1 : 0;

    // +1 = left (A), -1 = right (D). Positive yaw also turns left in the
    // camera convention used by the game. Gyro tilt is only consulted when
    // neither keyboard direction is held.
    const left = this.isDown("KeyA") || this.isDown("ArrowLeft") ? 1 : 0;
    const right = this.isDown("KeyD") || this.isDown("ArrowRight") ? 1 : 0;
    const keyboardSteer = left - right;
    const drift =
      this.isDown("Space") ||
      this.isDown("ShiftLeft") ||
      this.isDown("ShiftRight") ||
      this.touch.drift;

    return {
      throttle,
      brake,
      steer: keyboardSteer !== 0 ? keyboardSteer : this.tiltSteer,
      drift,
    };
  }

  /** Virtual buttons share the same edge-triggered drift/hop path as Space. */
  setTouchDrive(control: TouchDriveControl, active: boolean): void {
    this.touch[control] = this.enabled ? active : false;
  }

  /** -1 = right, +1 = left, matching the steering convention above. */
  setTiltSteer(steer: number): void {
    const value = Number.isFinite(steer) ? Math.max(-1, Math.min(1, steer)) : 0;
    this.tiltSteer = this.enabled ? value : 0;
  }

  queueItemUse(): void {
    if (this.enabled) {
      this.itemQueued = true;
    }
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
    this.clearHeld();
    this.clearQueuedActions();
  }

  private clearHeld(): void {
    this.down.clear();
    this.touch.throttle = false;
    this.touch.brake = false;
    this.touch.drift = false;
    this.tiltSteer = 0;
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
    this.clearHeld();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearHeld();
    }
  };
}
