import { racewayLayout } from "../src/tracks/courses/deepseek-raceway/layout";
import { describe, expect, it } from "vitest";
import { Track } from "../src/tracks/track";

describe("track", () => {
  const track = new Track(racewayLayout);

  it("coloca o spawn sobre a terra e alinhado com a reta", () => {
    expect(track.surfaceAt(track.spawn.pos.x, track.spawn.pos.z)).toBe("dirt");
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

  it("expõe checkpoints e linha de chegada", () => {
    expect(track.checkpoints.length).toBe(3);
    expect(track.finishLine.x).toBeCloseTo(track.spawn.pos.x);
    expect(track.finishLine.z).toBeCloseTo(track.spawn.pos.z);
    expect(track.checkpointRadius).toBeGreaterThan(6);
  });

  it("distribui as caixas de item pela pista", () => {
    expect(track.itemBoxes.length).toBe(12);
  });
});
