/**
 * Phones and tablets are detected from pointer capabilities, with a mobile
 * user-agent fallback for browsers that do not expose them. `?touch=1` forces
 * the mobile layout for debugging, and `?touch=0` forces the keyboard layout.
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const forced = new URLSearchParams(window.location.search).get("touch");
  if (forced === "1") return true;
  if (forced === "0") return false;
  if (typeof window.matchMedia !== "function") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    (navigator.maxTouchPoints > 0 && window.matchMedia("(hover: none)").matches) ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  );
}
