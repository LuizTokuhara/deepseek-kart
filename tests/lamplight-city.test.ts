import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { AIDriver } from "../src/actors/kart/ai";
import { Kart } from "../src/actors/kart/kart";
import { CollisionWorld, resolveKartPair } from "../src/core/collision";
import { FIXED_DT, GROUND_Y } from "../src/core/config";
import { LightRig } from "../src/decor/city/street-lights";
import { spawnOilSlick, updateOilSlicks } from "../src/items/oil-slick";
import type { ItemEvent } from "../src/items/item-types";
import { FACADE_STYLE, facadeBoxGeometry, facadeMaterial } from "../src/rendering/facade-material";
import { lamplightCity } from "../src/tracks/courses/lamplight-city";
import {
  lamplightCityLayout,
  lamplightOverpass,
} from "../src/tracks/courses/lamplight-city/layout";
import { createFilletedCurve } from "../src/tracks/curves";
import { pickLevel } from "../src/tracks/elevation";
import { Track } from "../src/tracks/track";

vi.mock("../src/decor/props/signs", () => ({
  signMaterial: () => new THREE.MeshBasicMaterial(),
  neonSignMaterial: () => new THREE.MeshBasicMaterial(),
}));

const DECK = lamplightOverpass.height;

/** Kart stopped at (x, z), on the requested level, facing `yaw`. */
function kartAt(track: Track, collision: CollisionWorld, x: number, z: number, yaw: number,
  level: number): Kart {
  const kart = new Kart(track.spawn, track, collision);
  kart.teleport(x, z, yaw, level);
  return kart;
}

describe("street curve with fillets", () => {
  it("should round each corner and run straight between them", () => {
    const curve = createFilletedCurve([[0, 0], [100, 0], [100, 100], [0, 100]], 10);
    const nearest = (x: number, z: number) => Math.min(...Array.from({ length: 2000 }, (_, i) => {
      const point = curve.getPointAt(i / 2000);
      return Math.hypot(point.x - x, point.z - z);
    }));

    expect(curve.getLength()).toBeCloseTo(400 - 4 * (2 - Math.PI / 2) * 10, 0);
    expect(nearest(50, 0)).toBeLessThan(0.05);
    expect(nearest(100, 100)).toBeCloseTo(10 * (Math.SQRT2 - 1), 0);
  });
});

describe("level picking", () => {
  it("should keep each object on the surface it can reach", () => {
    expect(pickLevel([0, 5.5], 0)).toBe(0);
    expect(pickLevel([0, 5.5], 5.4)).toBe(5.5);
    expect(pickLevel([0, 0.9], 0)).toBe(0.9);
    expect(pickLevel([0, 5.5])).toBe(5.5);
    expect(pickLevel([0, 5.5], -3)).toBe(0);
  });
});

describe("Lamplight City overpass", () => {
  const track = new Track(lamplightCityLayout);
  const collision = new CollisionWorld([...track.colliders]);

  it("should stack the deck over the start avenue at the crossing", () => {
    expect(track.heightAt(0, 0, 0)).toBe(0);
    expect(track.heightAt(0, 0, DECK)).toBeCloseTo(DECK, 2);
    expect(track.heightAt(0, 0)).toBeCloseTo(DECK, 2);
    // Outside the deck there is only the ground.
    expect(track.heightAt(12, 0, DECK)).toBe(0);
    expect(track.levelAt(0, 0, DECK)).toBeCloseTo(DECK, 2);
    expect(track.levelAt(0, 0, 0)).toBe(0);
  });

  it("should climb the ramps smoothly, without steps between path points", () => {
    let highest = 0;
    for (let index = 0; index < track.path.length; index++) {
      const here = track.pathLevel(index);
      const next = track.pathLevel((index + 1) % track.path.length);
      expect(Math.abs(next - here) / track.pathSpacing).toBeLessThan(0.21);
      highest = Math.max(highest, here);
    }
    expect(highest).toBeCloseTo(DECK, 2);
  });

  it("should draw both road levels where the physics expects them", () => {
    const road = track.group.getObjectByName("track-road") as THREE.Mesh;
    // Outside the mesh edges, so each level gives a single hit.
    const [x, z] = [2.37, 3.41];
    const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(road).map((hit) => hit.point.y - GROUND_Y);

    expect(hits).toHaveLength(2);
    expect(hits[0]).toBeCloseTo(track.heightAt(x, z, DECK), 2);
    expect(hits[1]).toBeCloseTo(track.heightAt(x, z, 0), 2);
  });

  it("should let parapets stop only karts on the deck and lower barriers only karts below", () => {
    // On the avenue, next to the barrier and under the deck: the parapet above does not push.
    const below = kartAt(track, collision, 2, 7, -Math.PI / 2, 0);
    // On the overpass, above the avenue barrier: only the parapet of its own level counts.
    const above = kartAt(track, collision, 0, 8, 0, DECK);
    const blocked = kartAt(track, collision, 7.5, 3, 0, DECK);
    const start = [below, above, blocked].map((kart) => ({ ...kart.state.pos }));
    for (const kart of [below, above, blocked]) collision.resolveKart(kart.state);

    expect(below.state.pos.z).toBeLessThan(start[0].z);
    expect(above.state.pos).toEqual(start[1]);
    expect(blocked.state.pos.x).toBeLessThan(start[2].x);
  });

  it("should not let karts on different levels collide", () => {
    const below = kartAt(track, collision, 0, 0, -Math.PI / 2, 0);
    const above = kartAt(track, collision, 0.5, 0, 0, DECK);
    resolveKartPair(below.state, above.state);

    expect(below.state.pos).toEqual({ x: 0, z: 0 });
    expect(above.state.pos).toEqual({ x: 0.5, z: 0 });
  });

  it("should leave an oil slick on the deck it was dropped on", () => {
    const group = new THREE.Group();
    const dropper = kartAt(track, collision, 0, 2, 0, DECK);
    const oilSlick = spawnOilSlick(dropper, "cpu", track, group);
    const below = kartAt(track, collision, oilSlick.x, oilSlick.z, -Math.PI / 2, 0);
    const events: ItemEvent[] = [];
    oilSlick.immunity = 0;
    updateOilSlicks([oilSlick], FIXED_DT, [{ id: "player", kart: below, rank: 1, isPlayer: true }],
      track, group, events);

    expect(oilSlick.y).toBeCloseTo(DECK, 2);
    expect(events).toHaveLength(0);
  });

  it("should drive the AI over the bridge and then under it on the same lap", () => {
    const kart = new Kart(track.spawn, track, collision);
    const ai = new AIDriver(track);
    const levels: number[] = [];
    for (let tick = 0; tick < 60 * 45; tick++) {
      kart.update(FIXED_DT, ai.update(kart, FIXED_DT));
      if (Math.hypot(kart.state.pos.x, kart.state.pos.z) < 3) levels.push(kart.state.height);
    }

    expect(levels.some((height) => Math.abs(height) < 0.1)).toBe(true);
    expect(levels.some((height) => Math.abs(height - DECK) < 0.1)).toBe(true);
    expect(levels.every((height) => Math.abs(height) < 0.1 || Math.abs(height - DECK) < 0.1))
      .toBe(true);
  });
});

describe("Lamplight City scenery", () => {
  const track = new Track(lamplightCityLayout);
  const decor = lamplightCity.createDecor(track);

  it("should line the streets with lit houses, shops and offices", () => {
    const bodies = decor.group.getObjectByName("building-bodies") as THREE.InstancedMesh;
    const facades = bodies.geometry.getAttribute("facade") as THREE.InstancedBufferAttribute;
    const styles = new Set(Array.from({ length: bodies.count }, (_, i) => facades.getZ(i)));

    expect(bodies.count).toBeGreaterThan(60);
    expect(styles).toEqual(new Set(Object.values(FACADE_STYLE)));
  });

  it("should keep every building off the sidewalks and out from under the overpass", () => {
    const buildings = decor.colliders.filter((box) => box.half.y > 2.5 && box.half.x > 3);
    for (const box of buildings) {
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cos = Math.cos(box.yaw);
        const sin = Math.sin(box.yaw);
        const x = box.center.x + dx * box.half.x * cos + dz * box.half.z * sin;
        const z = box.center.z - dx * box.half.x * sin + dz * box.half.z * cos;
        const nearest = track.path[track.nearestPathIndex(x, z)];
        expect(Math.hypot(nearest.x - x, nearest.z - z)).toBeGreaterThan(track.wallOffset + 3);
      }
    }
  });

  it("should draw lit windows with the facade node material", () => {
    const material = facadeMaterial();
    const geometry = facadeBoxGeometry([
      { seed: 1, lit: 0.5, style: FACADE_STYLE.shop, floorHeight: 3 },
    ]);

    expect((material as unknown as { isMeshToonNodeMaterial: boolean }).isMeshToonNodeMaterial)
      .toBe(true);
    expect(material.colorNode).toBeTruthy();
    expect(material.emissiveNode).toBeTruthy();
    expect(Array.from((geometry.getAttribute("facade") as THREE.BufferAttribute).array))
      .toEqual([1, 0.5, FACADE_STYLE.shop, 3]);
  });
});

describe("street light rig", () => {
  it("should keep a fixed number of lights and fade them out before they move", () => {
    const sources = Array.from({ length: 40 }, (_, i) =>
      new THREE.Vector3(i * 12, 6, i % 2 ? 8 : -8));
    const rig = new LightRig(sources, { count: 6 });
    const view = new THREE.Vector3();
    let previous: Map<number, number> | null = null;
    for (let step = 0; step < 900; step++) {
      view.set(step * 0.5, 2, 0);
      rig.update(view);
      const current = new Map<number, number>();
      for (const light of rig.lights) {
        const source = sources.findIndex((s) => s.equals(light.position));
        current.set(source, (current.get(source) ?? 0) + light.intensity);
      }
      for (const source of previous ? new Set([...previous.keys(), ...current.keys()]) : []) {
        const change = Math.abs((current.get(source) ?? 0) - (previous?.get(source) ?? 0));
        expect(change, `source ${source} at step ${step}`).toBeLessThan(42 * 0.2);
      }
      previous = current;
    }
    expect(rig.lights).toHaveLength(6);
  });
});
