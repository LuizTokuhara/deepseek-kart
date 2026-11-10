import { describe, expect, it } from "vitest";
import {
  gravityRollDegrees,
  TiltSteering,
  wrapDegrees,
} from "../src/mobile/tilt-steering";

describe("gyro steering", () => {
  it("uses gravity so both landscape grips share the same neutral", () => {
    expect(gravityRollDegrees(90, 0)).toBeCloseTo(0, 5);
    expect(gravityRollDegrees(0, -90)).toBeCloseTo(-90, 5);
    expect(gravityRollDegrees(0, 90)).toBeCloseTo(90, 5);
    expect(wrapDegrees(190)).toBeCloseTo(-170, 5);
    expect(wrapDegrees(-190)).toBeCloseTo(170, 5);
  });

  it("maps a counter-clockwise roll to a left turn in both landscape grips", () => {
    const tilt = new TiltSteering({ smooth: 1, deadZoneDeg: 0, rangeDeg: 25 });
    expect(tilt.update(0, -90)).toBe(0);
    expect(tilt.update(-10, -90)).toBeCloseTo(0.4, 5);
    expect(tilt.update(10, -90)).toBeCloseTo(-0.4, 5);
    expect(tilt.update(-30, -90)).toBeCloseTo(1, 5);
    expect(tilt.update(30, -90)).toBeCloseTo(-1, 5);

    const oppositeGrip = new TiltSteering({ smooth: 1, deadZoneDeg: 0, rangeDeg: 25 });
    expect(oppositeGrip.update(0, 90)).toBe(0);
    expect(oppositeGrip.update(10, 90)).toBeCloseTo(0.4, 5);
    expect(oppositeGrip.update(-10, 90)).toBeCloseTo(-0.4, 5);
  });

  it("recenters without requiring a perfectly level phone", () => {
    const tilt = new TiltSteering({ smooth: 1, deadZoneDeg: 0, rangeDeg: 25 });
    tilt.update(0, -90);
    tilt.update(-10, -90);
    expect(tilt.steer).toBeCloseTo(0.4, 5);

    tilt.recenter();
    expect(tilt.update(-10, -90)).toBe(0);
    expect(tilt.update(-20, -90)).toBeCloseTo(0.4, 5);
  });

  it("ignores small jitter around neutral and missing sensor samples", () => {
    const tilt = new TiltSteering({ smooth: 1, deadZoneDeg: 3, rangeDeg: 25 });
    tilt.update(0, -90);
    expect(tilt.update(-2, -90)).toBe(0);
    expect(tilt.update(-4, -90)).toBeCloseTo(1 / 22, 5);
    const before = tilt.steer;
    expect(tilt.update(null, -90)).toBe(before);
    expect(tilt.update(0, null)).toBe(before);
  });
});
