import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Input } from "../src/core/input";

describe("starting-grid input cleanup", () => {
  let target: EventTarget;
  const key = (type: string, code: string) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { code: { value: code }, repeat: { value: false } });
    target.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    target = new EventTarget();
    vi.stubGlobal("window", target);
    vi.stubGlobal("document", new EventTarget());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("leaves native menu keyboard actions alone while driving input is disabled", () => {
    const input = new Input(false);
    expect(key("keydown", "Space").defaultPrevented).toBe(false);
    key("keydown", "KeyW");
    key("keydown", "KeyR");
    expect(input.drive.throttle).toBe(0);
    expect(input.consumeReset()).toBe(false);
    input.setEnabled(true);
    expect(input.drive.drift).toBe(false);
    expect(key("keydown", "Space").defaultPrevented).toBe(true);
    expect(input.drive.drift).toBe(true);
  });

  it("uses T for telemetry instead of F3", () => {
    const input = new Input();
    key("keydown", "F3");
    expect(input.consumeDebug()).toBe(false);
    key("keydown", "KeyT");
    expect(input.consumeDebug()).toBe(true);
    expect(input.consumeDebug()).toBe(false);
  });

  it("discards held driving keys and queued menu-era actions before countdown", () => {
    const input = new Input();
    for (const code of ["KeyW", "KeyA", "Space", "KeyE", "KeyR", "KeyH", "KeyT"]) key("keydown", code);
    expect(input.drive).toMatchObject({ throttle: 1, steer: 1, drift: true });
    input.clearActions();
    expect(input.drive).toEqual({ throttle: 0, brake: 0, steer: 0, drift: false });
    expect([input.consumeItemUse(), input.consumeReset(), input.consumeHelp(), input.consumeDebug()])
      .toEqual([false, false, false, false]);
    key("keyup", "KeyW");
    key("keydown", "KeyW");
    key("keydown", "KeyE");
    expect(input.drive.throttle).toBe(1);
    expect(input.consumeItemUse()).toBe(true);
    expect(input.consumeItemUse()).toBe(false);
  });

  it("merges touch buttons, gyro steering and the keyboard at the same input seam", () => {
    const input = new Input();
    input.setTouchDrive("throttle", true);
    input.setTouchDrive("drift", true);
    input.setTiltSteer(0.6);
    expect(input.drive).toMatchObject({ throttle: 1, steer: 0.6, drift: true });

    key("keydown", "KeyD");
    expect(input.drive.steer).toBe(-1);
    key("keyup", "KeyD");
    expect(input.drive.steer).toBe(0.6);

    input.queueItemUse();
    expect(input.consumeItemUse()).toBe(true);
    input.setEnabled(false);
    input.queueItemUse();
    input.setTouchDrive("throttle", true);
    expect(input.drive).toEqual({ throttle: 0, brake: 0, steer: 0, drift: false });
    expect(input.consumeItemUse()).toBe(false);
  });
});
