import { racewayLayout } from "../src/tracks/courses/deepseek-raceway/layout";
import { describe, expect, it } from "vitest";
import { AIDriver } from "../src/actors/kart/ai";
import { CollisionWorld } from "../src/core/collision";
import { AI, FIXED_DT } from "../src/core/config";
import { Kart } from "../src/actors/kart/kart";
import { Race } from "../src/race/race";
import { Track, type TrackLike } from "../src/tracks/track";

describe("AI driver", () => {
  it("segue a centerline e completa pelo menos uma volta", () => {
    const track = new Track(racewayLayout);
    const collision = new CollisionWorld(track.colliders);
    const kart = new Kart(track.spawn, track, collision);
    const ai = new AIDriver(track);
    const race = new Race({
      checkpoints: track.checkpoints,
      finish: track.finishLine,
      radius: track.checkpointRadius,
      laps: 3,
    });

    let sawDrift = false;
    let sawMiniTurbo = false;

    for (let tick = 0; tick < 60 * 90; tick++) {
      const input = ai.update(kart, FIXED_DT);
      sawDrift ||= input.drift;
      kart.update(FIXED_DT, input);
      sawMiniTurbo ||= kart.state.miniTurboTimer > 0;
      race.update(FIXED_DT, kart.state);
      race.consumeEvent();
    }

    expect(Number.isFinite(kart.state.pos.x)).toBe(true);
    expect(Number.isFinite(kart.state.pos.z)).toBe(true);
    expect(kart.speed).toBeGreaterThan(5);
    expect(sawDrift).toBe(true);
    expect(sawMiniTurbo).toBe(true);
    expect(race.state.completedLaps).toBeGreaterThanOrEqual(3);
    expect(race.state.finished).toBe(true);
  }, 20_000);

  it("freia antes de uma curva fechada", () => {
    const track = circleTrack(10, 40);
    const collision = new CollisionWorld([]);
    const kart = new Kart(track.spawn, track, collision);
    const ai = new AIDriver(track);

    kart.state.vForward = AI.targetSpeed;
    kart.state.vel.x = Math.sin(kart.state.yaw) * AI.targetSpeed;
    kart.state.vel.z = Math.cos(kart.state.yaw) * AI.targetSpeed;

    const input = ai.update(kart, FIXED_DT);

    expect(input.throttle).toBe(0);
    expect(input.brake).toBeGreaterThan(0.5);
  });

  it("desvia de um adversário logo à frente", () => {
    const track = new Track(racewayLayout);
    const collision = new CollisionWorld(track.colliders);
    const kart = new Kart(track.spawn, track, collision);
    const ai = new AIDriver(track);

    const forwardX = Math.sin(track.spawn.yaw);
    const forwardZ = Math.cos(track.spawn.yaw);
    const normal = ai.update(kart, FIXED_DT);
    const avoiding = ai.update(kart, FIXED_DT, {
      rivals: [{
        x: track.spawn.pos.x + forwardX * 6,
        z: track.spawn.pos.z + forwardZ * 6,
      }],
    });

    expect(Math.abs(avoiding.steer - normal.steer)).toBeGreaterThan(0.15);
  });

  it("desvia de uma poça de óleo na sua linha", () => {
    const track = new Track(racewayLayout);
    const collision = new CollisionWorld(track.colliders);
    const kart = new Kart(track.spawn, track, collision);
    const ai = new AIDriver(track);

    const forwardX = Math.sin(track.spawn.yaw);
    const forwardZ = Math.cos(track.spawn.yaw);
    const rightX = -Math.cos(track.spawn.yaw);
    const rightZ = Math.sin(track.spawn.yaw);

    const normal = ai.update(kart, FIXED_DT);
    const oilSlick = {
      x: track.spawn.pos.x + forwardX * 7 + rightX * 2.5,
      z: track.spawn.pos.z + forwardZ * 7 + rightZ * 2.5,
    };
    const avoiding = ai.update(kart, FIXED_DT, { oilSlicks: [oilSlick] });

    expect(Math.abs(avoiding.steer - normal.steer)).toBeGreaterThan(0.15);
  });

  it("ajusta o ritmo com o paceScale do rubber-banding", () => {
    const track = new Track(racewayLayout);
    const collision = new CollisionWorld(track.colliders);
    const kart = new Kart(track.spawn, track, collision);
    const ai = new AIDriver(track);

    kart.state.vForward = AI.targetSpeed;
    kart.state.vel.x = Math.sin(kart.state.yaw) * AI.targetSpeed;
    kart.state.vel.z = Math.cos(kart.state.yaw) * AI.targetSpeed;

    const normal = ai.update(kart, FIXED_DT);
    const boosted = ai.update(kart, FIXED_DT, { paceScale: 1.07 });

    expect(normal.throttle).toBe(0);
    expect(boosted.throttle).toBe(1);
  });
});

/** Flat circular track for stable, isolated cornering checks. */
function circleTrack(radius: number, count: number): TrackLike {
  const path = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      x: Math.sin(angle) * radius,
      z: Math.cos(angle) * radius,
    };
  });
  const pathYaw = (index: number): number => {
    const previous = path[(index - 1 + count) % count];
    const next = path[(index + 1) % count];
    return Math.atan2(next.x - previous.x, next.z - previous.z);
  };
  const pathYawDelta = (index: number, ahead: number): number => {
    const from = pathYaw(((index % count) + count) % count);
    const to = pathYaw((((index + ahead) % count) + count) % count);
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
  };
  const nearestPathIndex = (
    x: number,
    z: number,
    hint: number | null = null,
    window = 24,
  ): number => {
    let best = 0;
    let bestDistance = Infinity;
    const start = hint === null ? 0 : hint - window;
    const end = hint === null ? count - 1 : hint + window;
    for (let i = start; i <= end; i++) {
      const index = ((i % count) + count) % count;
      const dx = path[index].x - x;
      const dz = path[index].z - z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  };

  return {
    width: 12,
    wallOffset: 6,
    pathSpacing: (Math.PI * 2 * radius) / count,
    bounds: { minX: -radius, maxX: radius, minZ: -radius, maxZ: radius },
    spawn: { pos: { ...path[0] }, yaw: pathYaw(0) },
    path,
    itemBoxes: [],
    checkpoints: [],
    finishLine: { x: path[0].x, z: path[0].z },
    colliders: [],
    checkpointRadius: 8,
    nearestPathIndex,
    pathYaw,
    pathYawDelta,
    surfaceAt: () => "asphalt",
  };
}
