import { racewayLayout } from "../src/tracks/courses/deepseek-raceway/layout";
import { describe, expect, it } from "vitest";
import { AIDriver } from "../src/actors/kart/ai";
import { CollisionWorld } from "../src/core/collision";
import { FIXED_DT } from "../src/core/config";
import { Kart } from "../src/actors/kart/kart";
import { Race } from "../src/race/race";
import { Track } from "../src/tracks/track";

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

  it("desvia de uma banana na sua linha", () => {
    const track = new Track(racewayLayout);
    const collision = new CollisionWorld(track.colliders);
    const kart = new Kart(track.spawn, track, collision);
    const ai = new AIDriver(track);

    const forwardX = Math.sin(track.spawn.yaw);
    const forwardZ = Math.cos(track.spawn.yaw);
    const rightX = -Math.cos(track.spawn.yaw);
    const rightZ = Math.sin(track.spawn.yaw);

    const normal = ai.update(kart, FIXED_DT);
    const banana = {
      x: track.spawn.pos.x + forwardX * 7 + rightX * 2.5,
      z: track.spawn.pos.z + forwardZ * 7 + rightZ * 2.5,
    };
    const avoiding = ai.update(kart, FIXED_DT, { bananas: [banana] });

    expect(Math.abs(avoiding.steer - normal.steer)).toBeGreaterThan(0.15);
  });

  it("ajusta o ritmo com o paceScale do rubber-banding", () => {
    const track = new Track(racewayLayout);
    const collision = new CollisionWorld(track.colliders);
    const kart = new Kart(track.spawn, track, collision);
    const ai = new AIDriver(track);

    kart.state.vForward = 16;
    kart.state.vel.x = Math.sin(kart.state.yaw) * 16;
    kart.state.vel.z = Math.cos(kart.state.yaw) * 16;

    const normal = ai.update(kart, FIXED_DT);
    const boosted = ai.update(kart, FIXED_DT, { paceScale: 1.07 });

    expect(normal.throttle).toBe(0);
    expect(boosted.throttle).toBe(1);
  });
});
