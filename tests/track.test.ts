import { describe, expect, it } from "vitest";
import { Track } from "../src/track";

describe("track", () => {
  const track = new Track();

  it("coloca o spawn sobre o asfalto e alinhado com a reta", () => {
    expect(track.surfaceAt(track.spawn.pos.x, track.spawn.pos.z)).toBe("asphalt");
    expect(Math.abs(track.spawn.yaw - Math.PI / 2)).toBeLessThan(0.05);
  });

  it("trata o interior do circuito como grama", () => {
    expect(track.surfaceAt(0, 0)).toBe("grass");
  });

  it("possui paredes e obstáculos colidíveis", () => {
    expect(track.colliders.length).toBeGreaterThan(100);
  });

  it("detecta fora dos limites do mapa", () => {
    expect(track.isOutOfBounds(0, 0)).toBe(false);
    expect(track.isOutOfBounds(1000, 0)).toBe(true);
    expect(track.isOutOfBounds(0, -1000)).toBe(true);
  });
});
