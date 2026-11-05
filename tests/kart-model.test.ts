import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  AI_PALETTE,
  KartModel,
  PLAYER_PALETTE,
} from "../src/kart-model";
import type { KartState } from "../src/types";

function baseState(overrides: Partial<KartState> = {}): KartState {
  return {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    yaw: 0,
    steer: 0,
    steerInput: 0,
    vForward: 0,
    vLateral: 0,
    surface: "asphalt",
    surfaceBlend: 0,
    height: 0,
    verticalVelocity: 0,
    grounded: true,
    drifting: false,
    driftDirection: 0,
    driftCharge: 0,
    driftTier: 0,
    miniTurboTimer: 0,
    miniTurboTier: 0,
    item: null,
    itemCount: 0,
    spinTimer: 0,
    ...overrides,
  };
}

describe("kart model", () => {
  it("constrói um kart dentro do footprint visual esperado", () => {
    const model = new KartModel(PLAYER_PALETTE);
    model.group.updateMatrixWorld(true);

    const size = new THREE.Box3()
      .setFromObject(model.group)
      .getSize(new THREE.Vector3());

    expect(size.x).toBeGreaterThan(1.4);
    expect(size.x).toBeLessThan(2.0);
    expect(size.y).toBeGreaterThan(1.0);
    expect(size.y).toBeLessThan(1.6);
    expect(size.z).toBeGreaterThan(2.0);
    expect(size.z).toBeLessThan(2.7);
    expect(model.group.children.length).toBeGreaterThan(5);
  });

  it("anima rodas e inclinação da carroceria", () => {
    const model = new KartModel(PLAYER_PALETTE);
    const state = baseState({
      vForward: 12,
      steer: 1,
      vLateral: 4,
      drifting: true,
      driftDirection: 1,
    });

    for (let tick = 0; tick < 30; tick++) {
      model.update(1 / 60, state);
    }

    expect(model.wheelAngle).not.toBe(0);
    expect(model.bodyRoll).toBeGreaterThan(0.04);

    model.reset();
    expect(model.wheelAngle).toBe(0);
    expect(model.bodyRoll).toBe(0);
  });

  it("tem paletas distintas para jogador e IA", () => {
    expect(PLAYER_PALETTE.body).not.toBe(AI_PALETTE.body);
    expect(PLAYER_PALETTE.accent).not.toBe(AI_PALETTE.accent);
    expect(PLAYER_PALETTE.number).not.toBe(AI_PALETTE.number);
  });
});
