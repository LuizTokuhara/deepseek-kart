import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { Kart } from "../src/actors/kart/kart";
import { CollisionWorld, resolveCircleObb } from "../src/core/collision";
import { FIXED_DT } from "../src/core/config";
import { hillColliders, type HillSpot } from "../src/decor/nature/hills";
import { RacewayDecor } from "../src/tracks/courses/deepseek-raceway/decor";
import { racewayLayout } from "../src/tracks/courses/deepseek-raceway/layout";
import { Track } from "../src/tracks/track";

// Sign canvases need a browser; the collision behaviour below does not.
vi.mock("../src/decor/props/signs", () => ({
  signMaterial: () => new THREE.MeshBasicMaterial(),
  neonSignMaterial: () => new THREE.MeshBasicMaterial(),
}));
vi.mock("../src/decor/props/start-banner", () => ({
  startBannerMaterial: () => new THREE.MeshBasicMaterial(),
}));

describe("hill colliders", () => {
  const hill: HillSpot = { x: 10, z: -5, sx: 17, sy: 7, sz: 15 };
  const colliders = hillColliders([hill]);

  it("rings the visible foot of the mound", () => {
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const x = hill.x + Math.cos(angle) * hill.sx * 0.99;
      const z = hill.z + Math.sin(angle) * hill.sz * 0.99;
      expect(
        colliders.some((box) => resolveCircleObb(x, z, 0.05, box)),
        `open foot at ${angle}`,
      ).toBe(true);
    }
    // The ring does not become an invisible box around the whole hill.
    expect(
      colliders.some((box) =>
        resolveCircleObb(hill.x + hill.sx * 1.2, hill.z, 0.05, box),
      ),
    ).toBe(false);
  });

  it("blocks the full height of the visible slope", () => {
    for (const box of colliders) {
      expect(box.center.y - box.half.y).toBeLessThanOrEqual(0.01);
      expect(box.center.y + box.half.y).toBeGreaterThanOrEqual(hill.sy);
    }
  });
});

describe("raceway hill collision", () => {
  it("stops a kart at the foot of the infield hill", () => {
    const track = new Track(racewayLayout);
    const decor = new RacewayDecor(track);
    const collision = new CollisionWorld([
      ...track.colliders,
      ...decor.colliders,
    ]);
    // Southern infield, facing the hill at (-14, 0).
    const kart = new Kart({ pos: { x: -14, z: -26 }, yaw: 0 }, track, collision);
    const input = { throttle: 1, brake: 0, steer: 0, drift: false };

    for (let tick = 0; tick < 60 * 5; tick++) {
      kart.update(FIXED_DT, input);
    }

    // It reaches the mound but cannot cross it; without the ring z would be
    // well past the hill center at z = 0.
    expect(kart.state.pos.z).toBeLessThan(-14.5);
    expect(kart.state.pos.z).toBeGreaterThan(-19);
  }, 10_000);
});
