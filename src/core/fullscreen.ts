import { isMobileDevice } from "./platform";

/**
 * Fullscreen is mobile-only and can only be requested from a user gesture.
 * The first pointer/key event is armed to request it, so the browser chrome
 * disappears as soon as the player interacts with the game.
 */
export async function requestGameFullscreen(): Promise<boolean> {
  if (!isMobileDevice()) return false;
  if (typeof document === "undefined") return false;
  if (document.fullscreenElement) return true;
  const root = document.documentElement;
  if (typeof root.requestFullscreen !== "function") return false;

  try {
    await root.requestFullscreen({ navigationUI: "hide" });
    return true;
  } catch {
    // iPhone Safari does not expose fullscreen for arbitrary elements.
    return false;
  }
}

/** Arms the earliest possible fullscreen request without stealing input. */
export function requestFullscreenOnFirstGesture(): void {
  if (!isMobileDevice()) return;
  let consumed = false;
  const attempt = (): void => {
    if (consumed) return;
    consumed = true;
    window.removeEventListener("pointerdown", attempt, true);
    window.removeEventListener("keydown", attempt, true);
    void requestGameFullscreen();
  };
  window.addEventListener("pointerdown", attempt, { capture: true, passive: true });
  window.addEventListener("keydown", attempt, true);
}
