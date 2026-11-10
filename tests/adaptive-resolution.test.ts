import { describe, expect, it } from "vitest";
import { AdaptiveResolution } from "../src/rendering/adaptive-resolution";

function run(controller: AdaptiveResolution, fps: number, seconds: number, visible = true): number[] {
  const changes: number[] = [];
  for (let frame = 0; frame < Math.ceil(fps * seconds); frame++) {
    const ratio = controller.update(1 / fps, visible);
    if (ratio !== null) changes.push(ratio);
  }
  return changes;
}

describe("adaptive 3D resolution", () => {
  it("starts Retina screens within the pixel budget while retaining CSS resolution", () => {
    const controller = new AdaptiveResolution();
    const ratio = controller.configure(1512, 982, 2);
    expect(ratio).toBeGreaterThanOrEqual(1);
    expect(1512 * 982 * ratio ** 2).toBeCloseTo(1920 * 1080);
    expect(controller.nativePixelRatio).toBe(2);
  });

  it("keeps full detail on standard density screens when 60 FPS is sustained", () => {
    const controller = new AdaptiveResolution();
    expect(controller.configure(1280, 720, 1)).toBe(1);
    expect(run(controller, 60, 30)).toEqual([]);
    expect(controller.pixelRatio).toBe(1);
  });

  it("responds to sustained low FPS with bounded changes instead of resizing each frame", () => {
    const controller = new AdaptiveResolution();
    const initial = controller.configure(1280, 720, 2);
    expect(run(controller, 45, 1)).toEqual([]);
    const changes = run(controller, 45, 8);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.length).toBeLessThanOrEqual(4);
    let previous = initial;
    for (const ratio of changes) {
      expect(ratio).toBeLessThan(previous);
      expect(ratio).toBeGreaterThanOrEqual(previous * 0.85);
      previous = ratio;
    }
  });

  it.each([1, 2, 3])("respects its quality floor and device ceiling at DPR %s", (dpr) => {
    const controller = new AdaptiveResolution();
    controller.configure(800, 600, dpr);
    run(controller, 30, 60);
    expect(controller.pixelRatio).toBeCloseTo(dpr === 1 ? 0.75 : 1);
    run(controller, 120, 300);
    expect(controller.pixelRatio).toBeCloseTo(Math.min(2, dpr));
  });

  it("recovers detail only after a long stable interval", () => {
    const controller = new AdaptiveResolution();
    controller.configure(1280, 720, 2);
    run(controller, 45, 5);
    // Finish the sampling window that straddles the change in workload.
    run(controller, 60, 3);
    const reduced = controller.pixelRatio;
    expect(run(controller, 60, 5)).toEqual([]);
    expect(controller.pixelRatio).toBe(reduced);
    run(controller, 60, 8);
    expect(controller.pixelRatio).toBeGreaterThan(reduced);
  });

  it("ignores background throttling and long tasks, then resumes sampling", () => {
    const controller = new AdaptiveResolution();
    const initial = controller.configure(1280, 720, 2);
    run(controller, 45, 2);
    run(controller, 30, 10, false);
    for (const dt of [0.25, 4, NaN, Infinity, 0, -1]) controller.update(dt);
    expect(controller.pixelRatio).toBe(initial);
    expect(run(controller, 45, 2)).toEqual([]);
    run(controller, 45, 2);
    expect(controller.pixelRatio).toBeLessThan(initial);
  });

  it("resets measurements when the viewport or display changes", () => {
    const controller = new AdaptiveResolution();
    controller.configure(1280, 720, 2);
    run(controller, 45, 2);
    expect(controller.configure(900, 600, 1)).toBe(1);
    expect(run(controller, 45, 2)).toEqual([]);
    expect(controller.nativePixelRatio).toBe(1);
  });
});
