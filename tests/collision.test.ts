import { describe, expect, it } from "vitest";
import { FIXED_DT, PHYSICS } from "../src/config";
import { Kart } from "../src/kart";
import type { ColliderBox } from "../src/types";
import {
  CollisionWorld,
  resolveCircleObb,
  resolveKartPair,
} from "../src/collision";

function box(
  x: number,
  z: number,
  halfX: number,
  halfZ: number,
  yaw = 0,
): ColliderBox {
  return {
    center: { x, y: 0.6, z },
    half: { x: halfX, y: 0.6, z: halfZ },
    yaw,
  };
}

function asphalt() {
  return { surfaceAt: () => "asphalt" as const };
}

function createKart(collision = new CollisionWorld([])) {
  return new Kart(
    { pos: { x: 0, z: 0 }, yaw: 0 },
    asphalt(),
    collision,
  );
}

function simulate(
  kart: Kart,
  seconds: number,
  input: { throttle: number; brake: number; steer: number; drift?: boolean },
) {
  const ticks = Math.round(seconds / FIXED_DT);
  const fullInput = { drift: false, ...input };
  for (let i = 0; i < ticks; i++) {
    kart.update(FIXED_DT, fullInput);
  }
}

describe("collision", () => {
  it("resolve um círculo contra a face de uma caixa", () => {
    const hit = resolveCircleObb(2.5, 0, 0.65, box(0, 0, 2, 2));
    expect(hit).not.toBeNull();
    expect(hit!.normal.x).toBeCloseTo(1);
    expect(hit!.normal.z).toBeCloseTo(0);
    expect(hit!.depth).toBeCloseTo(0.15);
  });

  it("resolve um círculo contra um canto", () => {
    const hit = resolveCircleObb(2.4, 2.4, 0.65, box(0, 0, 2, 2));
    expect(hit).not.toBeNull();
    expect(hit!.normal.x).toBeCloseTo(Math.SQRT1_2);
    expect(hit!.normal.z).toBeCloseTo(Math.SQRT1_2);
    expect(hit!.depth).toBeGreaterThan(0);
  });

  it("funciona com caixa rotacionada", () => {
    const hit = resolveCircleObb(1.0, 0, 0.65, box(0, 0, 2, 0.5, Math.PI / 2));
    expect(hit).not.toBeNull();
    expect(hit!.normal.x).toBeCloseTo(1);
    expect(hit!.normal.z).toBeCloseTo(0);
    expect(hit!.depth).toBeCloseTo(0.15);
  });

  it("não colide quando está longe", () => {
    expect(resolveCircleObb(5, 5, 0.65, box(0, 0, 2, 2))).toBeNull();
  });

  it("remove a velocidade normal em impacto frontal", () => {
    const world = new CollisionWorld([box(0, 5, 5, 0.5)]);
    const kart = createKart(world);
    kart.state.pos.z = 4.0;
    kart.state.vel.z = PHYSICS.topSpeed;
    kart.state.vForward = PHYSICS.topSpeed;

    world.resolveKart(kart.state);

    expect(kart.state.pos.z).toBeLessThan(3.31);
    expect(kart.state.vel.z).toBeLessThanOrEqual(0);
    expect(Math.abs(kart.state.vel.z)).toBeLessThan(5);
  });

  it("separa dois karts e remove a velocidade de aproximação", () => {
    const a = createKart();
    const b = createKart();
    a.state.pos.x = 0;
    a.state.pos.z = 0;
    b.state.pos.x = 1.2;
    b.state.pos.z = 0;
    a.state.vel.x = 2;
    b.state.vel.x = -2;

    resolveKartPair(a.state, b.state);

    const dx = b.state.pos.x - a.state.pos.x;
    const dz = b.state.pos.z - a.state.pos.z;
    const distance = Math.hypot(dx, dz);
    const nx = dx / distance;
    const nz = dz / distance;
    const relativeNormalVelocity =
      (b.state.vel.x - a.state.vel.x) * nx +
      (b.state.vel.z - a.state.vel.z) * nz;

    expect(distance).toBeGreaterThanOrEqual(PHYSICS.kartRadius * 2 - 1e-6);
    expect(relativeNormalVelocity).toBeGreaterThanOrEqual(0);
  });

  it("impede o kart de atravessar a parede sob aceleração", () => {
    const world = new CollisionWorld([box(0, 10, 20, 0.5)]);
    const kart = createKart(world);
    simulate(kart, 6, { throttle: 1, brake: 0, steer: 0 });

    expect(kart.state.pos.z).toBeLessThan(9.5);
    expect(Number.isFinite(kart.state.pos.z)).toBe(true);
  });
});
