import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Kart } from "../src/actors/kart/kart";
import { CollisionWorld, resolveCircleObb } from "../src/core/collision";
import { FIXED_DT, PHYSICS } from "../src/core/config";
import type { Surface } from "../src/core/types";
import { Track } from "../src/tracks/track";
import {
  sunstoneRuinsLayout,
  sunstoneTunnel,
} from "../src/tracks/courses/sunstone-ruins/layout";
import { SunstoneTunnel } from "../src/tracks/courses/sunstone-ruins/tunnel";
import { buildDuneLandscape } from "../src/tracks/courses/sunstone-ruins/dunes";
import { SunstoneDetails } from "../src/tracks/courses/sunstone-ruins/details";

function makeKart(surface: Surface) {
  return new Kart(
    { pos: { x: 0, z: 0 }, yaw: 0 },
    { surfaceAt: () => surface },
    new CollisionWorld([]),
  );
}

function simulate(
  kart: Kart,
  seconds: number,
  input: { throttle: number; brake: number; steer: number; drift?: boolean },
): void {
  const ticks = Math.round(seconds / FIXED_DT);
  const fullInput = { drift: false, ...input };
  for (let index = 0; index < ticks; index++) {
    kart.update(FIXED_DT, fullInput);
  }
}

describe("Sunstone Ruins", () => {
  it("keeps the dune landscape off the banked driving surface", () => {
    const track = new Track(sunstoneRuinsLayout);
    const dunes = buildDuneLandscape(track);
    dunes.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    for (const t of [0.2, 0.24, 0.28, 0.32, 0.35, 0.4, 0.49, 0.52, 0.56, 0.86, 0.9, 0.94]) {
      const p = sunstoneRuinsLayout.curve.getPointAt(t);
      const tangent = sunstoneRuinsLayout.curve.getTangentAt(t);
      for (const offset of [-7.2, 0, 7.2]) {
        const x = p.x + tangent.z * offset, z = p.z - tangent.x * offset;
        ray.set(new THREE.Vector3(x, 40, z), down);
        expect(ray.intersectObject(dunes), `sand covers bank at ${t}/${offset}`).toHaveLength(0);
      }
    }
    expect(dunes.geometry.boundingSphere!.radius).toBeGreaterThan(250);
  });

  it("keeps new archaeological props outside the full racing lane", () => {
    const track = new Track(sunstoneRuinsLayout);
    const details = new SunstoneDetails(track);
    expect(details.group.getObjectByName("buried-temple-court")).toBeDefined();
    expect(details.group.getObjectByName("oasis-water-stairs")).toBeDefined();
    expect(details.colliders.length).toBeGreaterThan(35);
    for (let index = 0; index < track.path.length; index++) {
      const point = track.path[index], yaw = track.pathYaw(index);
      for (const offset of [-6.8, 0, 6.8]) {
        const x = point.x + Math.cos(yaw) * offset, z = point.z - Math.sin(yaw) * offset;
        expect(details.colliders.find(box => resolveCircleObb(x, z, PHYSICS.kartRadius, box)),
          `new decoration blocks road at ${index}/${offset}`).toBeUndefined();
      }
    }
    // Static rubble, fabrics and carvings are merged instead of adding a draw
    // call per small decorative piece; palm instances stay separate.
    let batches = 0;
    details.group.traverse(object => { if (object instanceof THREE.Mesh) batches++; });
    expect(batches).toBeLessThan(30);
  });

  it("keeps the stone tunnel inside the route with sand run-off", () => {
    const track = new Track(sunstoneRuinsLayout);
    const tunnelPoint = sunstoneRuinsLayout.curve.getPointAt(
      (sunstoneTunnel.from + sunstoneTunnel.to) / 2,
    );

    expect(sunstoneRuinsLayout.surface).toBe("dirt");
    expect(sunstoneRuinsLayout.offroadSurface).toBe("sand");
    expect(sunstoneRuinsLayout.curve.getLength()).toBeGreaterThan(580);
    expect(track.surfaceAtT(sunstoneTunnel.from - 0.01)).toBe("dirt");
    expect(track.surfaceAtT(sunstoneTunnel.from + 0.01)).toBe("stone");
    expect(track.surfaceAtT(sunstoneTunnel.to - 0.01)).toBe("stone");
    expect(track.surfaceAtT(sunstoneTunnel.to + 0.01)).toBe("dirt");
    expect(track.surfaceAt(tunnelPoint.x, tunnelPoint.z)).toBe("stone");
    expect(track.surfaceAt(0, 0)).toBe("sand");
    expect(track.group.getObjectByName("stone-road-overlay")).toBeDefined();
    expect(sunstoneRuinsLayout.wallGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side: -1 }),
        expect.objectContaining({ side: 1 }),
      ]),
    );
  });

  it("makes stone less grippy than asphalt but far more planted than ice", () => {
    expect(PHYSICS.gripStone).toBeLessThan(PHYSICS.gripAsphalt);
    expect(PHYSICS.gripStone).toBeGreaterThan(PHYSICS.gripIce);
    expect(PHYSICS.gripStone).toBeGreaterThan(PHYSICS.gripGrass);

    const stone = makeKart("stone");
    const asphalt = makeKart("asphalt");
    for (const kart of [stone, asphalt]) {
      kart.state.vel.z = 15;
      kart.state.vForward = 15;
      simulate(kart, 0.9, { throttle: 1, brake: 0, steer: 1 });
    }
    expect(Math.abs(stone.state.vLateral)).toBeGreaterThan(
      Math.abs(asphalt.state.vLateral),
    );
  });

  it("slows down on the open desert sand", () => {
    const sand = makeKart("sand");
    const asphalt = makeKart("asphalt");
    simulate(sand, 3, { throttle: 1, brake: 0, steer: 0 });
    simulate(asphalt, 3, { throttle: 1, brake: 0, steer: 0 });
    expect(sand.state.vForward).toBeLessThan(asphalt.state.vForward);
  });

  it("lines the tunnel walls with stone colliders outside the driving lane", () => {
    const track = new Track(sunstoneRuinsLayout);
    const tunnel = new SunstoneTunnel(track);

    expect(tunnel.group.name).toBe("sunstone-tunnel");
    expect(tunnel.colliders.length).toBeGreaterThan(20);
    for (let index = 0; index < track.path.length; index++) {
      const point = track.path[index];
      const yaw = track.pathYaw(index);
      for (const offset of [-4.4, 0, 4.4]) {
        const x = point.x + Math.cos(yaw) * offset;
        const z = point.z - Math.sin(yaw) * offset;
        expect(
          tunnel.colliders.find((box) =>
            resolveCircleObb(x, z, PHYSICS.kartRadius, box),
          ),
          `tunnel collider blocks lane at ${index}/${offset}`,
        ).toBeUndefined();
      }
    }
  });
});
