import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { AIDriver } from "../src/actors/kart/ai";
import { Kart } from "../src/actors/kart/kart";
import { createRacers } from "../src/actors/racers";
import { CollisionWorld, resolveCircleObb } from "../src/core/collision";
import { FIXED_DT, PHYSICS, RACE } from "../src/core/config";
import { ItemSystem } from "../src/items";
import { Race } from "../src/race/race";
import { courses, defaultCourse, getCourse } from "../src/tracks/registry";
import { Track } from "../src/tracks/track";

// Only canvas text rendering needs a browser; geometry and collisions stay real.
vi.mock("../src/decor/props/signs", () => ({
  signMaterial: () => new THREE.MeshBasicMaterial(),
}));

describe("course registry", () => {
  it("selects registered courses and falls back safely for missing/unknown IDs", () => {
    expect(new Set(courses.map((course) => course.layout.id)).size).toBe(courses.length);
    for (const course of courses) expect(getCourse(course.layout.id)).toBe(course);
    expect(getCourse(null)).toBe(defaultCourse);
    expect(getCourse("unknown-course")).toBe(defaultCourse);
  });
});

describe.each(courses)("$layout.name integration", (course) => {
  const track = new Track(course.layout);
  const decor = course.createDecor(track);
  const collision = new CollisionWorld([...track.colliders, ...decor.colliders]);

  it("reuses the full racer roster and item system on a clear starting grid", () => {
    const racers = createRacers(track, collision);
    expect(racers).toHaveLength(RACE.opponents + 1);
    expect(new ItemSystem(track, collision).group.children.length).toBeGreaterThan(0);
    for (const racer of racers) {
      const { x, z } = racer.spawn.pos;
      expect(track.surfaceAt(x, z)).toBe(course.layout.surface);
      expect(collision.colliders.some((box) => resolveCircleObb(x, z, PHYSICS.kartRadius, box))).toBe(false);
    }
  });

  it("keeps scenery clear of the driving lanes and item pickups", () => {
    for (let index = 0; index < track.path.length; index++) {
      const point = track.path[index];
      const yaw = track.pathYaw(index);
      const laneOffset = Math.min(4.4, track.width / 2 - PHYSICS.kartRadius - 0.4);
      for (const offset of [-laneOffset, 0, laneOffset]) {
        const x = point.x + Math.cos(yaw) * offset;
        const z = point.z - Math.sin(yaw) * offset;
        const blockedBy = decor.colliders.find((box) =>
          resolveCircleObb(x, z, PHYSICS.kartRadius, box));
        expect(blockedBy, `blocked lane at ${index}, offset ${offset}`).toBeUndefined();
      }
    }
    for (const point of track.itemBoxes) {
      expect(decor.colliders.some((box) => resolveCircleObb(point.x, point.z, PHYSICS.kartRadius, box))).toBe(false);
    }
  });

  it("lets the shared AI finish three laps with all course colliders enabled", () => {
    const kart = new Kart(track.spawn, track, collision);
    const ai = new AIDriver(track);
    const race = new Race({
      checkpoints: track.checkpoints, finish: track.finishLine,
      radius: track.checkpointRadius, laps: RACE.laps,
    });
    for (let tick = 0; tick < 60 * 120 && !race.state.finished; tick++) {
      kart.update(FIXED_DT, ai.update(kart, FIXED_DT));
      race.update(FIXED_DT, kart.state);
      race.consumeEvent();
    }
    expect(race.state.finished).toBe(true);
    expect(race.state.completedLaps).toBe(RACE.laps);
  });
});
