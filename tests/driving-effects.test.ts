import { describe, expect, it } from "vitest";
import { SpeedLines } from "../src/rendering/speed-lines";
import { TireWake } from "../src/rendering/tire-wake";

function lineUniform(lines: SpeedLines, name: string): number {
  const uniforms = lines.mesh.material.userData.uniforms as
    Record<string, { value: number }>;
  return uniforms[name].value;
}

const driving = {
  falling: false, spinTimer: 0, miniTurboTimer: 0, miniTurboTier: 0,
  vForward: 22, drifting: false, driftCharge: 0.8, steer: 0.5,
};

describe("comic driving feedback", () => {
  it.each([1 / 30, 1 / 60, 1 / 120])("builds from drift to dash, then fades at %s seconds", (dt) => {
    const lines = new SpeedLines();
    const frame = { ...driving };
    lines.update(dt, frame, 16 / 9, true);
    expect(lines.mesh.visible).toBe(false);
    frame.drifting = true;
    for (let i = 0; i < 1 / dt; i++) lines.update(dt, frame, 16 / 9, true);
    const drift = lineUniform(lines, "strength");
    expect(drift).toBeGreaterThan(0.3);
    frame.drifting = false;
    frame.miniTurboTimer = 1;
    frame.miniTurboTier = 3;
    lines.update(dt, frame, 16 / 9, true);
    expect(lineUniform(lines, "kick")).toBeGreaterThan(0.8);
    for (let i = 0; i < 1 / dt; i++) lines.update(dt, frame, 16 / 9, true);
    expect(lineUniform(lines, "strength")).toBeGreaterThan(drift * 2);
    expect(lineUniform(lines, "kick")).toBe(0);
    frame.miniTurboTimer = 0;
    for (let i = 0; i < 1 / dt; i++) lines.update(dt, frame, 16 / 9, true);
    expect(lines.mesh.visible).toBe(false);
  });

  it("clears immediately for reduced motion, falls, spin and restart", () => {
    const lines = new SpeedLines();
    for (const stop of ["disabled", "falling", "spin", "reset"]) {
      const state = { ...driving, miniTurboTimer: 1, miniTurboTier: 2 };
      lines.update(0.05, state, 0.56, true);
      expect(lines.mesh.visible).toBe(true);
      if (stop === "reset") lines.reset();
      else lines.update(0.016, { ...state, falling: stop === "falling", spinTimer: stop === "spin" ? 1 : 0 }, 0.56, stop !== "disabled");
      expect(lines.mesh.visible).toBe(false);
      expect(lineUniform(lines, "strength")).toBe(0);
      expect(lineUniform(lines, "kick")).toBe(0);
    }
  });

  it("recycles tire wisps in a bounded pool and clears expired trails", () => {
    const wake = new TireWake();
    const matrices = wake.mesh.instanceMatrix;
    const opacity = wake.mesh.geometry.getAttribute("wispOpacity");
    for (let i = 0; i < 500; i++) wake.emit(i, 0, 0, 1, "asphalt", 22, false);
    expect(wake.mesh.count).toBe(160);
    expect(wake.mesh.instanceMatrix).toBe(matrices);
    expect(opacity.getX(0)).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) wake.update(1 / 60);
    expect(Array.from(opacity.array).every((value) => value === 0)).toBe(true);
    wake.emit(0, 1, 0, 0, "ice", 28, true);
    wake.reset();
    expect(Array.from(opacity.array).every((value) => value === 0)).toBe(true);
  });
});
