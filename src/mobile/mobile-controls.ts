import type { Game } from "../app/game";
import { requestGameFullscreen } from "../core/fullscreen";
import type { TouchDriveControl } from "../core/input";
import { TiltSteering } from "./tilt-steering";

type SensorPermission = "granted" | "denied";
type DeviceOrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<SensorPermission>;
};

interface HoldBinding {
  button: HTMLButtonElement;
  control: TouchDriveControl;
  pointers: Set<number>;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element #${id} not found`);
  }
  return element as T;
}

/**
 * Mobile racing controls: throttle/brake on the right, hop/drift and item on
 * the left, and gyroscope steering. Portrait pauses the simulation behind a
 * rotate gate, which is the fallback for browsers without orientation lock.
 */
export class MobileControls {
  private readonly root = requiredElement<HTMLElement>("touch-controls");
  private readonly gate = requiredElement<HTMLElement>("orientation-gate");
  private readonly status = requiredElement<HTMLElement>("touch-status");
  private readonly itemButton = requiredElement<HTMLButtonElement>("touch-item");
  private readonly portrait = window.matchMedia("(orientation: portrait)");
  private readonly tilt = new TiltSteering();
  private readonly holds: HoldBinding[];
  private sessionActive = false;
  private sensorAttached = false;
  private sensorSampleSeen = false;
  private sensorWatch = 0;

  constructor(private readonly game: Game) {
    this.holds = [
      this.bindHold("touch-throttle", "throttle"),
      this.bindHold("touch-brake", "brake"),
      this.bindHold("touch-drift", "drift"),
    ];

    this.itemButton.addEventListener("pointerdown", this.onItemPointerDown);
    this.itemButton.addEventListener("pointerup", this.onItemPointerUp);
    this.itemButton.addEventListener("pointercancel", this.onItemPointerUp);
    this.itemButton.addEventListener("contextmenu", this.preventContextMenu);
    this.portrait.addEventListener("change", this.updateLayout);
    window.addEventListener("orientationchange", this.updateLayout);
    window.screen.orientation?.addEventListener("change", this.updateLayout);
    window.addEventListener("blur", this.onWindowBlur);
    window.addEventListener("pointerup", this.releasePointers);
    window.addEventListener("pointercancel", this.releasePointers);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.game.onRaceReady = () => {
      // Buttons are hidden during the flyover/results, so no pointer may be
      // left captured. Recenter here after the player settles into the race.
      this.releaseAll();
      this.tilt.recenter();
    };
    this.updateLayout();
  }

  /** Called directly from the START gesture so iOS may show the motion prompt. */
  startSession(): void {
    this.sessionActive = true;
    this.releaseAll();
    this.tilt.recenter();
    this.requestTiltPermission();
    void this.requestImmersiveMode();
  }

  private bindHold(id: string, control: TouchDriveControl): HoldBinding {
    const button = requiredElement<HTMLButtonElement>(id);
    const binding: HoldBinding = { button, control, pointers: new Set() };
    button.addEventListener("pointerdown", (event) => {
      if (!this.sessionActive || this.portrait.matches) return;
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      binding.pointers.add(event.pointerId);
      this.syncHold(binding);
    });
    button.addEventListener("lostpointercapture", (event) => {
      if (binding.pointers.delete(event.pointerId)) this.syncHold(binding);
    });
    button.addEventListener("contextmenu", this.preventContextMenu);
    return binding;
  }

  private syncHold(binding: HoldBinding): void {
    const active = this.sessionActive && binding.pointers.size > 0;
    this.game.setTouchDrive(binding.control, active);
    binding.button.classList.toggle("active", active);
  }

  private readonly releasePointers = (event: PointerEvent): void => {
    for (const hold of this.holds) {
      if (hold.pointers.delete(event.pointerId)) this.syncHold(hold);
    }
    this.onItemPointerUp();
  };

  private readonly onItemPointerDown = (event: PointerEvent): void => {
    if (!this.sessionActive || this.portrait.matches) return;
    event.preventDefault();
    this.game.useTouchItem();
    this.itemButton.classList.add("active");
  };

  private readonly onItemPointerUp = (): void => {
    this.itemButton.classList.remove("active");
  };

  private readonly preventContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private releaseAll(): void {
    for (const hold of this.holds) {
      hold.pointers.clear();
      hold.button.classList.remove("active");
      this.game.setTouchDrive(hold.control, false);
    }
    this.onItemPointerUp();
  }

  private requestTiltPermission(): void {
    if (this.sensorAttached) {
      this.tilt.recenter();
      return;
    }

    const constructor = window.DeviceOrientationEvent as
      | DeviceOrientationConstructor
      | undefined;
    if (!constructor) {
      this.showSensorError("TILT NOT AVAILABLE ON THIS BROWSER");
      return;
    }

    if (typeof constructor.requestPermission !== "function") {
      this.attachSensor();
      return;
    }

    let request: Promise<SensorPermission>;
    try {
      request = constructor.requestPermission.call(constructor);
    } catch {
      this.showSensorError("MOTION ACCESS DENIED · ENABLE IN SETTINGS");
      return;
    }
    void request
      .then((permission) => {
        if (permission === "granted") {
          this.attachSensor();
        } else {
          this.showSensorError("MOTION ACCESS DENIED · ENABLE IN SETTINGS");
        }
      })
      .catch(() => {
        this.showSensorError("MOTION ACCESS DENIED · ENABLE IN SETTINGS");
      });
  }

  private attachSensor(): void {
    if (this.sensorAttached) return;
    this.sensorAttached = true;
    window.addEventListener("deviceorientation", this.onDeviceOrientation);
    window.clearTimeout(this.sensorWatch);
    this.sensorWatch = window.setTimeout(() => {
      if (!this.sensorSampleSeen && this.sessionActive) {
        this.showSensorError("TILT NOT AVAILABLE ON THIS DEVICE");
      }
    }, 3500);
  }

  private readonly onDeviceOrientation = (event: DeviceOrientationEvent): void => {
    if (!this.sessionActive || this.portrait.matches || document.hidden) return;
    if (event.beta === null || event.gamma === null) return;

    this.sensorSampleSeen = true;
    window.clearTimeout(this.sensorWatch);
    this.hideStatus();
    this.game.setTiltSteer(this.tilt.update(event.beta, event.gamma));
  };

  private showSensorError(message: string): void {
    this.game.setTiltSteer(0);
    this.status.textContent = message;
    this.status.classList.remove("hidden");
  }

  private hideStatus(): void {
    this.status.classList.add("hidden");
  }

  private async requestImmersiveMode(): Promise<void> {
    if (this.portrait.matches) return;

    await requestGameFullscreen();

    const orientation = window.screen.orientation as
      | (ScreenOrientation & { lock?: (mode: "landscape") => Promise<void> })
      | undefined;
    if (typeof orientation?.lock === "function") {
      try {
        await orientation.lock("landscape");
      } catch {
        // The CSS rotate gate remains the portable landscape fallback.
      }
    }
  }

  private readonly updateLayout = (): void => {
    const portrait = this.portrait.matches;
    this.gate.classList.toggle("hidden", !portrait);
    this.gate.inert = !portrait;
    this.gate.setAttribute("aria-hidden", String(!portrait));
    this.root.inert = portrait;
    this.root.setAttribute("aria-hidden", String(portrait));
    this.game.setPaused(portrait);
    this.game.setTiltSteer(0);
    this.tilt.reset();
    if (portrait) {
      this.releaseAll();
    }
  };

  private readonly onWindowBlur = (): void => {
    this.releaseAll();
    this.game.setTiltSteer(0);
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.onWindowBlur();
  };
}
