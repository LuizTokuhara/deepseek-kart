/** Actual phones and tablets, ignoring the `?touch` preview override. */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    (navigator.maxTouchPoints > 0 && window.matchMedia("(hover: none)").matches) ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  );
}

/**
 * Touch input layout: phones and tablets, with a mobile user-agent fallback.
 * `?touch=1` forces the mobile layout for debugging, and `?touch=0` forces the
 * keyboard layout. Fullscreen uses `isMobileDevice()` so a desktop preview does
 * not take over the browser window.
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const forced = new URLSearchParams(window.location.search).get("touch");
  if (forced === "1") return true;
  if (forced === "0") return false;
  return isMobileDevice();
}
