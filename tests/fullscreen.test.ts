import { afterEach, describe, expect, it, vi } from "vitest";
import { requestFullscreenOnFirstGesture, requestGameFullscreen } from "../src/core/fullscreen";
import { isMobileDevice, isTouchDevice } from "../src/core/platform";

interface DeviceOptions {
  readonly search?: string;
  readonly coarse?: boolean;
  readonly hoverNone?: boolean;
  readonly maxTouchPoints?: number;
  readonly userAgent?: string;
}

const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";

function stubDevice(options: DeviceOptions = {}): {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  requestFullscreen: ReturnType<typeof vi.fn>;
} {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const requestFullscreen = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("window", {
    location: { search: options.search ?? "" },
    matchMedia: (query: string) => ({
      matches: query === "(pointer: coarse)"
        ? options.coarse ?? false
        : query === "(hover: none)"
          ? options.hoverNone ?? false
          : false,
    }),
    addEventListener,
    removeEventListener,
  });
  vi.stubGlobal("navigator", {
    maxTouchPoints: options.maxTouchPoints ?? 0,
    userAgent: options.userAgent ?? DESKTOP_UA,
  });
  vi.stubGlobal("document", {
    fullscreenElement: null,
    documentElement: { requestFullscreen },
  });
  return { addEventListener, removeEventListener, requestFullscreen };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mobile-only fullscreen", () => {
  it("never arms fullscreen on desktop, including the mobile preview override", async () => {
    const desktop = stubDevice();
    expect(isMobileDevice()).toBe(false);
    requestFullscreenOnFirstGesture();
    expect(desktop.addEventListener).not.toHaveBeenCalled();
    await expect(requestGameFullscreen()).resolves.toBe(false);
    expect(desktop.requestFullscreen).not.toHaveBeenCalled();

    const preview = stubDevice({ search: "?touch=1" });
    expect(isTouchDevice()).toBe(true);
    expect(isMobileDevice()).toBe(false);
    requestFullscreenOnFirstGesture();
    expect(preview.addEventListener).not.toHaveBeenCalled();
    await expect(requestGameFullscreen()).resolves.toBe(false);
    expect(preview.requestFullscreen).not.toHaveBeenCalled();
  });

  it("arms the first gesture and enters fullscreen on a phone", async () => {
    const phone = stubDevice({ userAgent: IPHONE_UA, maxTouchPoints: 5, hoverNone: true });
    expect(isMobileDevice()).toBe(true);
    expect(isTouchDevice()).toBe(true);

    requestFullscreenOnFirstGesture();
    expect(phone.addEventListener).toHaveBeenCalledWith(
      "pointerdown",
      expect.any(Function),
      { capture: true, passive: true },
    );
    expect(phone.addEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
      true,
    );

    await expect(requestGameFullscreen()).resolves.toBe(true);
    expect(phone.requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
  });

  it("keeps fullscreen on mobile hardware when keyboard layout is forced", () => {
    const phone = stubDevice({ search: "?touch=0", userAgent: IPHONE_UA });
    expect(isTouchDevice()).toBe(false);
    expect(isMobileDevice()).toBe(true);
    requestFullscreenOnFirstGesture();
    expect(phone.addEventListener).toHaveBeenCalledTimes(2);
  });
});
