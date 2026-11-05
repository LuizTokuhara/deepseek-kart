import { describe, expect, it } from "vitest";
import { CollisionWorld } from "../src/collision";
import { PHYSICS, RACE } from "../src/config";
import { createRacers } from "../src/racers";
import { Track } from "../src/track";

describe("racer roster", () => {
  it("creates the player and four CPU rivals on separate grid slots", () => {
    const track = new Track();
    const collision = new CollisionWorld(track.colliders);
    const racers = createRacers(track, collision);

    expect(racers).toHaveLength(1 + RACE.opponents);
    expect(racers[0].isPlayer).toBe(true);
    expect(racers[0].driver).toBeNull();
    expect(racers[0].spawn.pos).toEqual(track.spawn.pos);

    const rivals = racers.slice(1);
    expect(rivals.every((racer) => !racer.isPlayer)).toBe(true);
    expect(rivals.every((racer) => racer.driver !== null)).toBe(true);
    expect(new Set(racers.map((racer) => racer.id)).size).toBe(racers.length);
    expect(new Set(racers.map((racer) => racer.color)).size).toBe(racers.length);

    for (let first = 0; first < racers.length; first++) {
      expect(
        track.surfaceAt(
          racers[first].spawn.pos.x,
          racers[first].spawn.pos.z,
        ),
      ).not.toBe("grass");

      for (let second = first + 1; second < racers.length; second++) {
        const a = racers[first].spawn.pos;
        const b = racers[second].spawn.pos;
        expect(
          Math.hypot(a.x - b.x, a.z - b.z),
        ).toBeGreaterThanOrEqual(PHYSICS.kartRadius * 2);
      }
    }
  });

  it("resets every racer independently", () => {
    const track = new Track();
    const collision = new CollisionWorld(track.colliders);
    const racers = createRacers(track, collision);

    racers[2].kart.state.pos.x += 12;
    racers[2].kart.state.item = "mushroom";

    racers[2].kart.reset();
    racers[2].race.reset();

    expect(racers[2].kart.state.pos).toEqual(racers[2].spawn.pos);
    expect(racers[2].kart.state.item).toBeNull();
    expect(racers[2].race.state.completedLaps).toBe(0);
    expect(racers[1].kart.state.pos).toEqual(racers[1].spawn.pos);
  });
});
