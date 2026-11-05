import { describe, expect, it } from "vitest";
import { AIDriver } from "../src/ai";
import { CollisionWorld, resolveCircleObb } from "../src/collision";
import { FIXED_DT, PHYSICS } from "../src/config";
import { Kart } from "../src/kart";
import { Race } from "../src/race";
import { Track } from "../src/track";
import { TropicalScenery } from "../src/decor";

describe("tropical scenery", () => {
  const track = new Track();
  const scenery = new TropicalScenery(track);

  it("keeps the centerline, item lanes and driving clearance free of scenery colliders", () => {
    for (let index = 0; index < track.path.length; index++) {
      const point = track.path[index];
      const yaw = track.pathYaw(index);
      for (const offset of [-4.4, -3.2, 0, 3.2, 4.4]) {
        const x = point.x + Math.cos(yaw) * offset;
        const z = point.z - Math.sin(yaw) * offset;
        const obstacle = scenery.colliders.find(box =>
          resolveCircleObb(x, z, PHYSICS.kartRadius, box) !== null);
        expect(obstacle, `blocked lane at path ${index}, offset ${offset}`).toBeUndefined();
      }
    }
  });

  it("leaves both grass runoff corridors clear of new scenery", () => {
    for (let index = 0; index < track.path.length; index++) {
      const t = index / track.path.length;
      const side = t > 0.30 && t < 0.365 ? 1 : t > 0.675 && t < 0.74 ? -1 : 0;
      if (side === 0) continue;
      const point = track.path[index];
      const yaw = track.pathYaw(index);
      for (const offset of [8, 11, 14]) {
        const x = point.x + Math.cos(yaw) * side * offset;
        const z = point.z - Math.sin(yaw) * side * offset;
        expect(scenery.colliders.some(box =>
          resolveCircleObb(x, z, PHYSICS.kartRadius, box) !== null)).toBe(false);
      }
    }
  });

  it("lets the AI complete a race with the new barriers and scenery colliders", () => {
    const collision = new CollisionWorld([...track.colliders, ...scenery.colliders]);
    const kart = new Kart(track.spawn, track, collision);
    const ai = new AIDriver(track);
    const race = new Race({ checkpoints: track.checkpoints, finish: track.finishLine,
      radius: track.checkpointRadius, laps: 3 });
    for (let tick = 0; tick < 60 * 90 && !race.state.finished; tick++) {
      kart.update(FIXED_DT, ai.update(kart, FIXED_DT));
      race.update(FIXED_DT, kart.state);
      race.consumeEvent();
    }
    expect(race.state.finished).toBe(true);
    expect(race.state.completedLaps).toBe(3);
  }, 20_000);
});
