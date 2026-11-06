import { describe, expect, it, vi } from "vitest";
import { PenguinCrossing, PENGUIN_TIMING } from "../src/tracks/courses/vanilla-lake/penguin-crossing";
import { vanillaLakeLayout } from "../src/tracks/courses/vanilla-lake/layout";
import { Track } from "../src/tracks/track";
import { CollisionWorld, resolveCircleObb } from "../src/core/collision";
import { Kart } from "../src/actors/kart/kart";
import { AIDriver } from "../src/actors/kart/ai";
import { Race } from "../src/race/race";
import { FIXED_DT } from "../src/core/config";

const track = new Track(vanillaLakeLayout);
const leg = PENGUIN_TIMING.wait + PENGUIN_TIMING.warning + PENGUIN_TIMING.crossing;

describe("travessia dos pinguins", () => {
  it("avisa antes de entrar, atravessa e repete o percurso com uma pausa em cada margem", () => {
    const crossing = new PenguinCrossing(track);
    const start = { ...crossing.colliders[0].center };
    crossing.fixedUpdate(PENGUIN_TIMING.wait + 0.1);
    expect(crossing.phases[0]).toBe("warning");
    expect(crossing.colliders[0].center).toEqual(start);
    expect(crossing.movingObstacles[0].vx).toBeCloseTo(0);
    crossing.fixedUpdate(PENGUIN_TIMING.warning - 0.1 + PENGUIN_TIMING.crossing / 2);
    expect(crossing.phases[0]).toBe("crossing");
    const middle = { ...crossing.colliders[0].center };
    expect(Math.hypot(middle.x - start.x, middle.z - start.z)).toBeCloseTo(track.width / 2 - 0.7);
    crossing.fixedUpdate(PENGUIN_TIMING.crossing / 2);
    expect(crossing.phases[0]).toBe("waiting");
    const end = { ...crossing.colliders[0].center };
    crossing.fixedUpdate(2);
    expect(crossing.colliders[0].center).toEqual(end);
    crossing.fixedUpdate(leg - 2);
    expect(crossing.colliders[0].center.x).toBeCloseTo(start.x);
    expect(crossing.colliders[0].center.z).toBeCloseTo(start.z);
  });

  it("sincroniza modelo, IA e colisor sem deixar uma colisão na posição antiga", () => {
    const crossing = new PenguinCrossing(track);
    const world = new CollisionWorld([...crossing.colliders]);
    const oldPosition = { ...crossing.colliders[0].center };
    crossing.fixedUpdate(PENGUIN_TIMING.wait + PENGUIN_TIMING.warning + PENGUIN_TIMING.crossing / 2);
    const model = crossing.group.children.find((object) => object.name === "crossing-penguin")!;
    expect(world.colliders[0]).toBe(crossing.colliders[0]);
    expect(model.position.x).toBe(world.colliders[0].center.x);
    expect(model.position.z).toBe(world.colliders[0].center.z);
    expect(crossing.movingObstacles[0].x).toBe(model.position.x);
    expect(crossing.movingObstacles[0].z).toBe(model.position.z);
    expect(resolveCircleObb(oldPosition.x, oldPosition.z, 0.2, world.colliders[0])).toBeNull();
    expect(resolveCircleObb(model.position.x, model.position.z, 0.2, world.colliders[0])).not.toBeNull();
  });

  it("mantém o padrão independente do frame rate e restaura as referências ao reiniciar", () => {
    const results: Array<Array<{ x: number; y: number; z: number }>> = [];
    for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
      const crossing = new PenguinCrossing(track);
      const boxes = [...crossing.colliders];
      const initial = boxes.map((box) => ({ ...box.center }));
      for (let i = 0; i < Math.round(9 / dt); i++) crossing.fixedUpdate(dt);
      results.push(boxes.map((box) => ({ ...box.center })));
      crossing.reset();
      expect(crossing.phases).toEqual(["waiting", "waiting", "waiting"]);
      boxes.forEach((box, i) => {
        expect(crossing.colliders[i]).toBe(box);
        expect(box.center).toEqual(initial[i]);
      });
    }
    for (const result of results.slice(1)) result.forEach((point, i) => {
      expect(point.x).toBeCloseTo(results[0][i].x, 7);
      expect(point.z).toBeCloseTo(results[0][i].z, 7);
    });
  });

  it("colide no chão e permite passar por cima em um salto alto", () => {
    const crossing = new PenguinCrossing(track);
    crossing.fixedUpdate(PENGUIN_TIMING.wait + PENGUIN_TIMING.warning + PENGUIN_TIMING.crossing / 2);
    const box = crossing.colliders[0];
    const spawn = { pos: { x: box.center.x, z: box.center.z }, yaw: box.yaw };
    const world = new CollisionWorld(crossing.colliders);
    const grounded = new Kart(spawn, track, world);
    world.resolveKart(grounded.state);
    expect(Math.hypot(grounded.state.pos.x - spawn.pos.x, grounded.state.pos.z - spawn.pos.z)).toBeGreaterThan(0.1);
    const airborne = new Kart(spawn, track, world);
    airborne.state.height = box.center.y + box.half.y + 1;
    airborne.state.grounded = false;
    world.resolveKart(airborne.state);
    expect(airborne.state.pos).toEqual(spawn.pos);
  });

  it("não mantém os antigos obstáculos estáticos de pinguim", () => {
    expect(vanillaLakeLayout.obstacles.some((obstacle) => obstacle.shape === "penguin")).toBe(false);
  });

  it.each([-2.5, 2.5])("permite à IA completar voltas na linha %s sem resgate por travamento", (lane) => {
    const crossing = new PenguinCrossing(track);
    const world = new CollisionWorld([...track.colliders, ...crossing.colliders]);
    const kart = new Kart(track.spawn, track, world);
    const teleport = vi.spyOn(kart, "teleport");
    const ai = new AIDriver(track, lane);
    const race = new Race({ checkpoints: track.checkpoints, finish: track.finishLine, radius: track.checkpointRadius, laps: 3 });
    for (let tick = 0; tick < 90 / FIXED_DT; tick++) {
      crossing.fixedUpdate(FIXED_DT);
      kart.update(FIXED_DT, ai.update(kart, FIXED_DT, { movingObstacles: crossing.movingObstacles }));
      race.update(FIXED_DT, kart.state);
      race.consumeEvent();
    }
    expect(race.state.completedLaps).toBeGreaterThanOrEqual(2);
    expect(teleport).not.toHaveBeenCalled();
    expect(kart.speed).toBeGreaterThan(4);
  }, 20_000);

  it("a IA antecipa uma travessia na sua linha e não freia por um pinguim se afastando", () => {
    const kart = new Kart(track.spawn, track, new CollisionWorld([]));
    const ai = new AIDriver(track, 0);
    const fx = Math.sin(kart.state.yaw), fz = Math.cos(kart.state.yaw);
    const rx = -fz, rz = fx;
    kart.state.vel = { x: fx * 16, z: fz * 16 };
    kart.state.vForward = 16;
    const normal = ai.update(kart, FIXED_DT);
    const obstacle = { x: kart.state.pos.x + fx * 8 + rx * 3, z: kart.state.pos.z + fz * 8 + rz * 3,
      radius: 0.65, vx: -rx * 4, vz: -rz * 4 };
    const avoiding = ai.update(kart, FIXED_DT, { movingObstacles: [obstacle] });
    expect(avoiding.brake).toBeGreaterThan(normal.brake);
    expect(Math.abs(avoiding.steer - normal.steer)).toBeGreaterThan(0.1);
    const clearing = ai.update(kart, FIXED_DT, { movingObstacles: [{ ...obstacle, vx: rx * 4, vz: rz * 4 }] });
    expect(clearing.brake).toBe(normal.brake);
    expect(clearing.steer).toBeCloseTo(normal.steer);
  });
});
