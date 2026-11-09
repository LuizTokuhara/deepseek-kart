import { describe, expect, it } from "vitest";
import { AI } from "../src/core/config";
import { paceScaleForGap } from "../src/race/difficulty";

describe("difficulty pace scaling", () => {
  it("normal runs slightly slower than hard", () => {
    expect(paceScaleForGap(0, 1, "normal")).toBeCloseTo(AI.normalPaceScale);
    expect(paceScaleForGap(0, 1, "hard")).toBe(1);
  });

  it("normal slows a CPU that is ahead of the player", () => {
    const ahead = -AI.rubberBandDistance - 1;
    expect(paceScaleForGap(ahead, 1, "normal")).toBeCloseTo(
      AI.normalPaceScale * AI.rubberBandSlow,
    );
  });

  it("hard keeps full pace for a CPU that is ahead", () => {
    const ahead = -AI.rubberBandDistance - 1;
    expect(paceScaleForGap(ahead, 1, "hard")).toBe(1);
  });

  it("both modes boost a CPU that is behind the player", () => {
    const behind = AI.rubberBandDistance + 1;
    expect(paceScaleForGap(behind, 1, "normal")).toBeCloseTo(
      AI.normalPaceScale * AI.rubberBandBoost,
    );
    expect(paceScaleForGap(behind, 1, "hard")).toBeCloseTo(AI.rubberBandBoost);
  });

  it("keeps the neutral pace inside the rubber-band window", () => {
    expect(paceScaleForGap(0, 1.02, "normal")).toBeCloseTo(
      AI.normalPaceScale * 1.02,
    );
    expect(paceScaleForGap(0, 1.02, "hard")).toBeCloseTo(1.02);
  });
});
