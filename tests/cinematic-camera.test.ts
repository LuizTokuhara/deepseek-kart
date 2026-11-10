import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AIDriver } from "../src/actors/kart/ai";
import { createRacers } from "../src/actors/racers";
import { CINEMATIC, FIXED_DT, GROUND_Y, RACE } from "../src/core/config";
import { CollisionWorld } from "../src/core/collision";
import {
  CinematicCamera,
  type CinematicSubject,
  type ShotKind,
} from "../src/rendering/cinematic-camera";
import { defaultCourse } from "../src/tracks/registry";
import { Track } from "../src/tracks/track";

/** A CPU-only race filmed by the director, like the opening cinematic. */
function filmDemoRace(seconds: number) {
  const track = new Track(defaultCourse.layout);
  const collision = new CollisionWorld(track.colliders);
  const racers = createRacers(track, collision);
  const autopilot = new AIDriver(track, 0);
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 500);
  const director = new CinematicCamera(camera, track);
  director.start();

  const subjects: CinematicSubject[] = racers.map(() => ({ x: 0, y: 0, z: 0, yaw: 0 }));
  const frames: { kind: ShotKind; position: THREE.Vector3; subject: CinematicSubject }[] = [];
  const steps = Math.round(seconds / FIXED_DT);
  for (let step = 0; step < steps; step++) {
    if (step * FIXED_DT >= 3) {
      for (const racer of racers) {
        const driver = racer.driver ?? autopilot;
        racer.kart.update(FIXED_DT, driver.update(racer.kart, FIXED_DT));
      }
    }
    // Rank by distance from the grid; close enough for framing.
    const ordered = [...racers].sort((a, b) =>
      Math.hypot(b.kart.state.pos.x - track.spawn.pos.x, b.kart.state.pos.z - track.spawn.pos.z) -
      Math.hypot(a.kart.state.pos.x - track.spawn.pos.x, a.kart.state.pos.z - track.spawn.pos.z));
    ordered.forEach((racer, index) => {
      Object.assign(subjects[index], {
        x: racer.kart.state.pos.x,
        y: racer.kart.state.height,
        z: racer.kart.state.pos.z,
        yaw: racer.kart.state.yaw,
      });
    });
    director.update(FIXED_DT, subjects);
    frames.push({
      kind: director.shotKind,
      position: camera.position.clone(),
      subject: { ...subjects[0] },
    });
  }
  return { track, camera, frames };
}

describe("cinematic camera", () => {
  it("holds the grid through the countdown and cuts once the field has passed", () => {
    const { frames } = filmDemoRace(CINEMATIC.gridShot + 0.1);
    const countdownFrames = Math.floor(RACE.countdown / FIXED_DT);
    expect(frames.slice(0, countdownFrames).every((frame) => frame.kind === "grid")).toBe(true);
    const cut = frames.findIndex((frame) => frame.kind !== "grid");
    expect(cut).toBeGreaterThan(countdownFrames);
    expect(cut * FIXED_DT).toBeLessThan(CINEMATIC.gridShot);
  });

  it("cuts through every racing angle during the film", () => {
    const { frames } = filmDemoRace(CINEMATIC.duration);
    const kinds = new Set(frames.map((frame) => frame.kind));
    for (const kind of ["grid", "trackside", "chase", "front", "wheel", "helicopter"] as const) {
      expect(kinds).toContain(kind);
    }
  });

  it("keeps the camera finite and above the ground", () => {
    const { frames, track } = filmDemoRace(CINEMATIC.duration);
    for (const { position } of frames) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
      expect(Number.isFinite(position.z)).toBe(true);
      expect(position.y).toBeGreaterThan(GROUND_Y + (track.heightAt?.(position.x, position.z) ?? 0) + 0.3);
    }
  });

  it("plants trackside cameras between the road edge and the wall", () => {
    const { frames, track } = filmDemoRace(CINEMATIC.duration * 2);
    const trackside = frames.filter((frame) => frame.kind === "trackside");
    expect(trackside.length).toBeGreaterThan(0);
    for (const { position } of trackside) {
      const index = track.nearestPathIndex(position.x, position.z);
      const point = track.path[index];
      const lateral = Math.hypot(position.x - point.x, position.z - point.z);
      expect(lateral).toBeGreaterThan(track.width / 2 - 0.5);
      expect(lateral).toBeLessThan(track.wallOffset);
    }
  });

  it("restarts on the grid", () => {
    const track = new Track(defaultCourse.layout);
    const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 500);
    const director = new CinematicCamera(camera, track);
    const subject = { x: track.spawn.pos.x, y: 0, z: track.spawn.pos.z, yaw: track.spawn.yaw };
    director.start();
    director.update(CINEMATIC.gridShot + 0.1, [subject]);
    expect(director.shotKind).not.toBe("grid");
    director.start();
    director.update(FIXED_DT, [subject]);
    expect(director.shotKind).toBe("grid");
  });
});
