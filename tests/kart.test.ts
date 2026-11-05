import { describe, expect, it } from "vitest";
import { FIXED_DT, PHYSICS } from "../src/config";
import { CollisionWorld } from "../src/collision";
import { Kart } from "../src/kart";
import type { Surface } from "../src/types";

function makeKart(surface: Surface = "asphalt") {
  const track = { surfaceAt: () => surface };
  return new Kart(
    { pos: { x: 0, z: 0 }, yaw: 0 },
    track,
    new CollisionWorld([]),
  );
}

function simulate(
  kart: Kart,
  seconds: number,
  input: { throttle: number; brake: number; steer: number; drift?: boolean },
): void {
  const ticks = Math.round(seconds / FIXED_DT);
  const fullInput = { drift: false, ...input };
  for (let i = 0; i < ticks; i++) {
    kart.update(FIXED_DT, fullInput);
  }
}

describe("kart physics", () => {
  it("acelera até perto da velocidade máxima", () => {
    const kart = makeKart();
    simulate(kart, 10, { throttle: 1, brake: 0, steer: 0 });

    expect(kart.state.vForward).toBeGreaterThan(PHYSICS.topSpeed * 0.95);
    expect(kart.state.vForward).toBeLessThanOrEqual(PHYSICS.topSpeed + 1e-6);
  });

  it("freia até perto de zero", () => {
    const kart = makeKart();
    simulate(kart, 8, { throttle: 1, brake: 0, steer: 0 });
    const initialZ = kart.state.pos.z;

    simulate(kart, 1.2, { throttle: 0, brake: 1, steer: 0 });

    expect(Math.abs(kart.state.vForward)).toBeLessThan(1.5);
    expect(kart.state.pos.z - initialZ).toBeLessThan(16);
    expect(kart.state.pos.z).toBeGreaterThan(initialZ);
  });

  it("dá ré depois de parar e respeita o limite", () => {
    const kart = makeKart();
    simulate(kart, 3, { throttle: 0, brake: 1, steer: 0 });

    expect(kart.state.vForward).toBeLessThan(-4);
    expect(kart.state.vForward).toBeGreaterThanOrEqual(-PHYSICS.reverseSpeed - 1e-6);
  });

  it("vira para a esquerda e para a direita", () => {
    const left = makeKart();
    left.state.vel.z = 10;
    left.state.vForward = 10;
    simulate(left, 1, { throttle: 0, brake: 0, steer: 1 });

    const right = makeKart();
    right.state.vel.z = 10;
    right.state.vForward = 10;
    simulate(right, 1, { throttle: 0, brake: 0, steer: -1 });

    expect(left.state.yaw).toBeGreaterThan(0.2);
    expect(right.state.yaw).toBeLessThan(-0.2);
  });

  it("perde velocidade e grip na grama", () => {
    const asphaltKart = makeKart("asphalt");
    const grassKart = makeKart("grass");

    simulate(asphaltKart, 8, { throttle: 1, brake: 0, steer: 0 });
    simulate(grassKart, 8, { throttle: 1, brake: 0, steer: 0 });

    expect(grassKart.state.vForward).toBeLessThan(asphaltKart.state.vForward * 0.8);
    expect(grassKart.state.vForward).toBeGreaterThan(11);
    expect(grassKart.state.vForward).toBeLessThan(15);
  });

  it("faz hop ao pressionar drift e volta ao chão", () => {
    const kart = makeKart();
    kart.update(FIXED_DT, { throttle: 0, brake: 0, steer: 0, drift: true });

    expect(kart.state.grounded).toBe(false);
    expect(kart.state.height).toBeGreaterThan(0);

    simulate(kart, 0.6, { throttle: 0, brake: 0, steer: 0 });

    expect(kart.state.grounded).toBe(true);
    expect(kart.state.height).toBe(0);
  });

  it("não inicia drift com o kart parado", () => {
    const kart = makeKart();
    kart.update(FIXED_DT, { throttle: 0, brake: 0, steer: 1, drift: true });

    expect(kart.state.drifting).toBe(false);
    expect(kart.state.height).toBeGreaterThan(0);
  });

  it("carrega o drift e ativa mini-turbo ao soltar", () => {
    const kart = makeKart();
    kart.state.vel.z = 15;
    kart.state.vForward = 15;

    simulate(kart, 1.0, { throttle: 1, brake: 0, steer: 1, drift: true });
    expect(kart.state.drifting).toBe(true);
    expect(kart.state.driftTier).toBeGreaterThanOrEqual(1);
    expect(Math.abs(kart.state.vLateral)).toBeGreaterThan(1.5);

    simulate(kart, 0.6, { throttle: 1, brake: 0, steer: 1, drift: true });
    expect(kart.state.driftTier).toBe(3);

    kart.update(FIXED_DT, { throttle: 1, brake: 0, steer: 1, drift: false });

    expect(kart.state.drifting).toBe(false);
    expect(kart.state.miniTurboTier).toBe(3);
    expect(kart.state.miniTurboTimer).toBeGreaterThan(0);
  });

  it("troca o lado do drift mantendo o botão pressionado", () => {
    const kart = makeKart();
    kart.state.vel.z = 15;
    kart.state.vForward = 15;

    simulate(kart, 0.5, { throttle: 1, brake: 0, steer: -1, drift: true });
    expect(kart.state.drifting).toBe(true);
    expect(kart.state.driftDirection).toBe(-1);

    simulate(kart, 0.6, { throttle: 1, brake: 0, steer: 1, drift: true });
    expect(kart.state.drifting).toBe(true);
    expect(kart.state.driftDirection).toBe(1);
    expect(kart.state.driftCharge).toBeLessThan(0.5);
  });

  it("mini-turbo ultrapassa a velocidade máxima base e depois decai", () => {
    const kart = makeKart();
    simulate(kart, 8, { throttle: 1, brake: 0, steer: 0 });

    const baseSpeed = kart.state.vForward;
    kart.state.miniTurboTier = 3;
    kart.state.miniTurboTimer = PHYSICS.miniTurbo.durations[3];

    simulate(kart, 0.5, { throttle: 1, brake: 0, steer: 0 });
    expect(kart.state.vForward).toBeGreaterThan(baseSpeed + 0.8);
    expect(kart.state.vForward).toBeGreaterThan(PHYSICS.topSpeed + 0.5);
    expect(kart.state.vForward).toBeLessThanOrEqual(
      PHYSICS.topSpeed + PHYSICS.miniTurbo.topSpeedBonus[3] + 1e-6,
    );

    simulate(kart, 1.5, { throttle: 0, brake: 0, steer: 0 });
    expect(kart.state.vForward).toBeLessThan(PHYSICS.topSpeed + 0.75);
  });

  it("perde controle e aceleração durante o spin", () => {
    const kart = makeKart();
    kart.state.vel.z = 10;
    kart.state.vForward = 10;
    kart.state.spinTimer = 1;
    const yawBefore = kart.state.yaw;

    simulate(kart, 0.5, { throttle: 1, brake: 0, steer: 1 });

    expect(kart.state.spinTimer).toBeGreaterThan(0);
    expect(kart.state.yaw).toBeCloseTo(yawBefore, 5);
    expect(kart.state.vForward).toBeLessThan(10);
  });

  it("não produz NaN em uma simulação longa", () => {
    const kart = makeKart();
    simulate(kart, 60, { throttle: 1, brake: 0, steer: 0.35 });

    expect(Number.isFinite(kart.state.pos.x)).toBe(true);
    expect(Number.isFinite(kart.state.pos.z)).toBe(true);
    expect(Number.isFinite(kart.state.yaw)).toBe(true);
    expect(Number.isFinite(kart.state.vForward)).toBe(true);
    expect(Number.isFinite(kart.state.vLateral)).toBe(true);
  });
});
