import { describe, expect, it } from "vitest";
import { macroNoiseTexture } from "../src/rendering/macro-noise";

function texelReader(): { size: number; at: (x: number, y: number) => number } {
  const texture = macroNoiseTexture();
  const { data, width } = texture.image as { data: Uint8Array; width: number };
  return { size: width, at: (x, y) => data[(y * width + x) * 4] };
}

describe("macroNoiseTexture", () => {
  it("should share a single texture across terrain materials", () => {
    expect(macroNoiseTexture()).toBe(macroNoiseTexture());
  });

  it("should tile without a visible seam at the wrap edges", () => {
    const { size, at } = texelReader();
    let interior = 0;
    let wrap = 0;

    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size - 1; j++) {
        interior = Math.max(interior, Math.abs(at(j, i) - at(j + 1, i)));
        interior = Math.max(interior, Math.abs(at(i, j) - at(i, j + 1)));
      }
      wrap = Math.max(wrap, Math.abs(at(size - 1, i) - at(0, i)));
      wrap = Math.max(wrap, Math.abs(at(i, size - 1) - at(i, 0)));
    }

    // Crossing the wrap must be no harsher than any step inside the tile.
    expect(wrap).toBeLessThanOrEqual(interior);
  });

  it("should spread values around mid-grey so tone varies both ways", () => {
    const { size, at } = texelReader();
    let min = 255;
    let max = 0;
    let sum = 0;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const value = at(x, y);
        min = Math.min(min, value);
        max = Math.max(max, value);
        sum += value;
      }
    }

    expect(min).toBeLessThan(90);
    expect(max).toBeGreaterThan(165);
    expect(sum / (size * size)).toBeGreaterThan(95);
    expect(sum / (size * size)).toBeLessThan(160);
  });
});
