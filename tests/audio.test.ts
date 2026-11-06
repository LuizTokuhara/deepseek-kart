import { describe, expect, it } from "vitest";
import { clamp, midiToFrequency } from "../src/audio/synth";

describe("audio synthesis helpers", () => {
  it("converts MIDI notes to equal-tempered frequencies", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(81)).toBeCloseTo(880, 6);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
  });

  it("clamps levels into the mixer range", () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.6, 0, 1)).toBe(0.6);
    expect(clamp(4, 0, 1)).toBe(1);
  });
});
