import { describe, expect, it } from "vitest";
import { AIDriver } from "../src/ai";
import { CollisionWorld } from "../src/collision";
import { FIXED_DT } from "../src/config";
import { Kart } from "../src/kart";
import { Race } from "../src/race";
import { Track } from "../src/track";

describe("AI driver", () => {
  it("segue a centerline e completa pelo menos uma volta", () => {
    const track = new Track();
    const collision = new CollisionWorld(track.colliders);
    const kart = new Kart(track.spawn, track, collision);
    const ai = new AIDriver(track);
    const race = new Race({
      checkpoints: track.checkpoints,
      finish: track.finishLine,
      radius: track.checkpointRadius,
      laps: 3,
    });

    for (let tick = 0; tick < 60 * 90; tick++) {
      const input = ai.update(kart, FIXED_DT);
      kart.update(FIXED_DT, input);
      race.update(FIXED_DT, kart.state);
      race.consumeEvent();
    }

    expect(Number.isFinite(kart.state.pos.x)).toBe(true);
    expect(Number.isFinite(kart.state.pos.z)).toBe(true);
    expect(kart.speed).toBeGreaterThan(5);
    expect(race.state.completedLaps).toBeGreaterThanOrEqual(3);
    expect(race.state.finished).toBe(true);
  }, 20_000);
});
