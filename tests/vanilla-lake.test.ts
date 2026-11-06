import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Kart } from "../src/actors/kart/kart";
import { CollisionWorld } from "../src/core/collision";
import { FIXED_DT, GROUND_Y, KART_WHEEL_CONTACTS } from "../src/core/config";
import type { Surface } from "../src/core/types";
import { Track } from "../src/tracks/track";
import { insideLake } from "../src/tracks/courses/vanilla-lake/lake-scenery";
import { vanillaLakeLayout } from "../src/tracks/courses/vanilla-lake/layout";

function makeKart(surface: Surface) {
  const track = { surfaceAt: () => surface };
  return new Kart(
    { pos: { x: 0, z: 0 }, yaw: 0 },
    track,
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

function trackPoint(track: Track, t: number, lateral = 0) {
  const point = vanillaLakeLayout.curve.getPointAt(t);
  const tangent = vanillaLakeLayout.curve.getTangentAt(t).normalize();
  const yaw = Math.atan2(tangent.x, tangent.z);
  return {
    x: point.x - Math.cos(yaw) * lateral,
    z: point.z + Math.sin(yaw) * lateral,
    yaw,
  };
}

describe("Vanilla Lake", () => {
  it("usa gelo e tem menos grip lateral que o asfalto", () => {
    const ice = makeKart("ice");
    const asphalt = makeKart("asphalt");
    for (const kart of [ice, asphalt]) {
      kart.state.yaw = 0;
      kart.state.vel.z = 15;
      kart.state.vForward = 15;
      simulate(kart, 0.9, { throttle: 1, brake: 0, steer: 1 });
    }

    expect(Math.abs(ice.state.vLateral)).toBeGreaterThan(
      Math.abs(asphalt.state.vLateral) * 1.4,
    );
  });

  it("inclina as curvas para o lado externo e mantém a pista dirigível", () => {
    const track = new Track(vanillaLakeLayout);
    const corner = trackPoint(track, 0.92);
    const bank = track.bankAt(corner.x, corner.z);
    expect(bank).toBeLessThan(-0.1);

    const rightX = -Math.cos(corner.yaw);
    const rightZ = Math.sin(corner.yaw);
    const outside = track.heightAt(
      corner.x - rightX * 4,
      corner.z - rightZ * 4,
    );
    const inside = track.heightAt(
      corner.x + rightX * 4,
      corner.z + rightZ * 4,
    );
    expect(outside).toBeGreaterThan(inside + 0.5);
  });

  it("sobe na rampa e decola no kicker", () => {
    const track = new Track(vanillaLakeLayout);
    const ramp = vanillaLakeLayout.features!.ramps![0];
    const center = trackPoint(track, ramp.t, ramp.lateral);
    const forwardX = Math.sin(center.yaw);
    const forwardZ = Math.cos(center.yaw);
    const kart = new Kart(
      {
        pos: {
          x: center.x - forwardX * 9,
          z: center.z - forwardZ * 9,
        },
        yaw: center.yaw,
      },
      track,
      new CollisionWorld(track.colliders),
    );
    kart.state.vel.x = forwardX * 18;
    kart.state.vel.z = forwardZ * 18;
    kart.state.vForward = 18;

    let maxHeight = 0;
    let airborne = false;
    for (let tick = 0; tick < 90; tick++) {
      kart.update(FIXED_DT, { throttle: 1, brake: 0, steer: 0, drift: false });
      maxHeight = Math.max(maxHeight, kart.state.height);
      airborne ||= !kart.state.grounded;
    }

    expect(maxHeight).toBeGreaterThan(0.8);
    expect(airborne).toBe(true);
  });

  it("detecta o buraco e devolve o kart à pista com o Lakitu", () => {
    const track = new Track(vanillaLakeLayout);
    const hole = vanillaLakeLayout.features!.holes![0];
    const center = trackPoint(track, hole.t, hole.lateral);
    const forwardX = Math.sin(center.yaw);
    const forwardZ = Math.cos(center.yaw);
    const kart = new Kart(
      {
        pos: {
          x: center.x - forwardX * (hole.radiusZ + 0.15),
          z: center.z - forwardZ * (hole.radiusZ + 0.15),
        },
        yaw: center.yaw,
      },
      track,
      new CollisionWorld(track.colliders),
    );
    kart.state.vel.x = forwardX * 16;
    kart.state.vel.z = forwardZ * 16;
    kart.state.vForward = 16;
    kart.state.item = "mushroom";
    kart.state.itemCount = 1;

    let fell = false;
    let rescued = false;
    for (let tick = 0; tick < 300; tick++) {
      kart.update(FIXED_DT, { throttle: 1, brake: 0, steer: 0, drift: false });
      fell ||= kart.state.falling;
      if (fell && !kart.state.falling) {
        rescued = true;
        break;
      }
    }

    expect(fell).toBe(true);
    expect(rescued).toBe(true);
    expect(track.holeAt(kart.state.pos.x, kart.state.pos.z)).toBe(false);
    expect(kart.state.height).toBeGreaterThanOrEqual(-0.01);
    expect(kart.state.item).toBe("mushroom");
  });

  it("coloca o ponto de resgate antes do buraco e dentro da pista", () => {
    const track = new Track(vanillaLakeLayout);
    const hole = vanillaLakeLayout.features!.holes![1];
    const center = trackPoint(track, hole.t, hole.lateral);
    const recovery = track.recoveryPoint(center.x, center.z);

    expect(track.holeAt(recovery.pos.x, recovery.pos.z)).toBe(false);
    expect(track.surfaceAt(recovery.pos.x, recovery.pos.z)).toBe("ice");
    expect(track.isOutOfBounds(recovery.pos.x, recovery.pos.z)).toBe(false);
  });
});

// Verifica a superfície renderizada, além do heightfield da física.
describe("contato com o terreno da Vanilla Lake", () => {
  const track = new Track(vanillaLakeLayout);
  const input = { throttle: 1, brake: 0, steer: 0, drift: false };

  it.each(vanillaLakeLayout.features!.banks!.map((bank) => (bank.from + bank.to) / 2))("mantém o lado externo alto na malha e na física em t=%s", (t) => {
    const corner = trackPoint(track, t);
    const tangentBefore = vanillaLakeLayout.curve.getTangentAt(t - 0.005);
    const tangentAfter = vanillaLakeLayout.curve.getTangentAt(t + 0.005);
    const right = { x: -Math.cos(corner.yaw), z: Math.sin(corner.yaw) };
    const turn = (tangentAfter.x - tangentBefore.x) * right.x + (tangentAfter.z - tangentBefore.z) * right.z;
    const outerSign = -Math.sign(turn);
    const outer = trackPoint(track, t, outerSign * 4);
    const inner = trackPoint(track, t, -outerSign * 4);
    expect(track.heightAt(outer.x, outer.z)).toBeGreaterThan(track.heightAt(inner.x, inner.z) + 0.5);
    const road = track.group.getObjectByName("track-road")!;
    track.group.updateMatrixWorld(true);
    for (const point of [outer, inner]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(point.x, 10, point.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(road)[0];
      expect(hit).toBeDefined();
      expect(Math.abs(hit.point.y - GROUND_Y - track.heightAt(point.x, point.z))).toBeLessThan(0.025);
      const kart = new Kart({ pos: point, yaw: point.yaw }, track, new CollisionWorld([]));
      simulate(kart, 0.2, { throttle: 0, brake: 0, steer: 0 });
      const rotation = new THREE.Euler(kart.state.groundPitch, point.yaw, kart.state.groundRoll, "YXZ");
      for (const wheel of KART_WHEEL_CONTACTS) {
        const foot = new THREE.Vector3(wheel.x, 0, wheel.z).applyEuler(rotation);
        const x = point.x + foot.x;
        const z = point.z + foot.z;
        const gap = kart.state.height + foot.y - track.heightAt(x, z);
        expect(gap).toBeGreaterThan(-0.06);
        expect(gap).toBeLessThan(0.1);
      }
    }
  });

  it("mantém contato contínuo nas entradas e saídas das curvas", () => {
    track.group.updateMatrixWorld(true);
    const road = track.group.getObjectByName("track-road")!;
    const snow = track.group.getObjectByName("track-ground")!;
    for (const bank of vanillaLakeLayout.features!.banks!) {
      for (let i = 0; i <= 30; i++) {
        const t = (bank.from + (bank.to - bank.from) * i / 30) % 1;
        for (const side of [-1, 1]) {
          const point = trackPoint(track, t, side * 4);
          const ray = new THREE.Raycaster(new THREE.Vector3(point.x, 10, point.z), new THREE.Vector3(0, -1, 0));
          const roadHit = ray.intersectObject(road)[0];
          const snowHit = ray.intersectObject(snow)[0];
          expect(roadHit).toBeDefined();
          expect(Math.abs(roadHit.point.y - GROUND_Y - track.heightAt(point.x, point.z))).toBeLessThan(0.04);
          expect(snowHit.point.y).toBeLessThan(roadHit.point.y);
          const next = trackPoint(track, (t + 0.00005) % 1, side * 4);
          expect(Math.abs(track.heightAt(next.x, next.z) - track.heightAt(point.x, point.z))).toBeLessThan(0.02);
        }
      }
    }
  });

  it("renderiza o topo das rampas voltado para cima e na altura do contato", () => {
    track.group.updateMatrixWorld(true);
    const meshes: THREE.Object3D[] = [];
    track.group.traverse((object) => { if (object.name === "ramp-surface") meshes.push(object); });
    for (const ramp of vanillaLakeLayout.features!.ramps!) {
      const center = trackPoint(track, ramp.t, ramp.lateral);
      for (const progress of [0.05, 0.5, 0.95]) {
        const along = (progress - 0.5) * ramp.length;
        const x = center.x + Math.sin(center.yaw) * along;
        const z = center.z + Math.cos(center.yaw) * along;
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObjects(meshes)[0];
        expect(hit).toBeDefined();
        expect(hit.point.y - GROUND_Y).toBeCloseTo(track.heightAt(x, z), 5);
      }
    }
  });

  it("não dá impulso ao descer de ré nem ao sair pela lateral", () => {
    const ramp = vanillaLakeLayout.features!.ramps![0];
    const center = trackPoint(track, ramp.t, ramp.lateral);
    const point = (x: number, z: number) => new THREE.Vector3(x, 0, z)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), center.yaw)
      .add(new THREE.Vector3(center.x, 0, center.z));
    for (const [from, to] of [
      [point(0, -ramp.length / 2 + 0.1), point(0, -ramp.length / 2 - 0.1)],
      [point(ramp.width / 2 - 0.1, 0), point(ramp.width / 2 + 0.1, 0)],
      [point(-ramp.width / 2 + 0.1, 0), point(-ramp.width / 2 - 0.1, 0)],
      [point(ramp.width / 2 + 0.5, ramp.length / 2 - 0.1), point(ramp.width / 2 + 0.5, ramp.length / 2 + 0.1)],
    ]) {
      expect(track.rampLaunchAt(from.x, from.z, to.x, to.z)).toBe(0);
    }
  });

  it.each([0, 1, 2])("decola e pousa na rampa %s com quatro ou só duas rodas", (rampIndex) => {
    const ramp = vanillaLakeLayout.features!.ramps![rampIndex];
    for (const side of [-1, 0, 1]) {
      for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
        const center = trackPoint(track, ramp.t, ramp.lateral! + side * (ramp.width / 2 + 0.25));
        const fx = Math.sin(center.yaw);
        const fz = Math.cos(center.yaw);
        const kart = new Kart({ pos: { x: center.x - fx * 9, z: center.z - fz * 9 }, yaw: center.yaw }, track, new CollisionWorld(track.colliders));
        kart.state.vel.x = fx * 18;
        kart.state.vel.z = fz * 18;
        let launch: { x: number; z: number; height: number } | undefined;
        let landed = false;
        let peak = 0;
        let tilted = false;
        for (let tick = 0; tick < 2 / dt; tick++) {
          kart.update(dt, input);
          if (side !== 0 && kart.state.grounded && Math.abs(kart.state.groundRoll) > 0.1) tilted = true;
          if (!kart.state.grounded && !launch) {
            launch = { ...kart.state.pos, height: kart.state.height };
            expect(kart.state.verticalVelocity).toBeGreaterThan(3);
            expect(kart.state.falling).toBe(false);
          }
          peak = Math.max(peak, kart.state.height);
          if (launch && kart.state.grounded) {
            expect(Math.hypot(kart.state.pos.x - launch.x, kart.state.pos.z - launch.z)).toBeGreaterThan(8);
            landed = true;
            break;
          }
        }
        expect(launch, `rampa ${rampIndex}, lado ${side}, dt ${dt}`).toBeDefined();
        expect(peak).toBeGreaterThan(launch!.height + 0.3);
        expect(landed).toBe(true);
        if (side !== 0) expect(tilted).toBe(true);
      }
    }
  });

  it.each([0, 1, 2, 3, 4, 5])("não afunda nem inclina antes da abertura do buraco %s", (holeIndex) => {
    const hole = vanillaLakeLayout.features!.holes![holeIndex];
    const center = trackPoint(track, hole.t, hole.lateral);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const local = new THREE.Vector3(Math.cos(angle) * hole.radiusX * 0.95, 0, Math.sin(angle) * hole.radiusZ * 0.95);
      local.applyAxisAngle(new THREE.Vector3(0, 1, 0), center.yaw);
      const pos = { x: center.x + local.x, z: center.z + local.z };
      expect(track.holeAt(pos.x, pos.z)).toBe(false);
      const kart = new Kart({ pos, yaw: center.yaw }, track, new CollisionWorld([]));
      simulate(kart, 0.2, { throttle: 0, brake: 0, steer: 0 });
      expect(kart.state.falling).toBe(false);
      expect(kart.state.grounded).toBe(true);
      expect(kart.state.height).toBeCloseTo(0, 3);
      expect(kart.state.groundPitch).toBeCloseTo(0, 3);
      expect(kart.state.groundRoll).toBeCloseTo(0, 3);
      kart.teleport(center.x + local.x * 0.9, center.z + local.z * 0.9);
      kart.update(FIXED_DT, { ...input, throttle: 0 });
      expect(kart.state.falling).toBe(true);
    }
  });

  it("permite saltar sobre a água abaixo do antigo limiar de 0.9 m", () => {
    const hole = vanillaLakeLayout.features!.holes![0];
    const center = trackPoint(track, hole.t, hole.lateral);
    const kart = new Kart({ pos: center, yaw: center.yaw }, track, new CollisionWorld([]));
    kart.state.height = 0.5;
    kart.state.grounded = false;
    kart.state.verticalVelocity = 2;
    kart.update(FIXED_DT, { ...input, throttle: 0 });
    expect(kart.state.falling).toBe(false);
    expect(kart.state.grounded).toBe(false);
    simulate(kart, 0.5, { throttle: 0, brake: 0, steer: 0 });
    expect(kart.state.falling).toBe(true);
  });
});

describe("traçado ampliado da Vanilla Lake", () => {
  it("tem uma volta maior, largada oeste e checkpoints na linha segura", () => {
    const layout = vanillaLakeLayout;
    expect(layout.curve.getLength()).toBeGreaterThan(550);
    expect(layout.width).toBeGreaterThanOrEqual(17);
    const spawn = layout.curve.getPointAt(layout.spawnT);
    const forward = layout.curve.getTangentAt(layout.spawnT);
    expect(spawn.x).toBeLessThan(-75);
    expect(forward.z).toBeLessThan(-0.95);
    const track = new Track(layout);
    for (const t of [layout.spawnT, ...layout.checkpointTs]) {
      const point = layout.curve.getPointAt(t);
      expect(track.holeAt(point.x, point.z)).toBe(false);
    }
  });

  it("mantém a água decorativa fora de toda a largura da pista", () => {
    for (let i = 0; i < 600; i++) {
      for (const lateral of [-vanillaLakeLayout.width / 2, 0, vanillaLakeLayout.width / 2]) {
        const t = i / 600;
        const point = vanillaLakeLayout.curve.getPointAt(t);
        const tangent = vanillaLakeLayout.curve.getTangentAt(t);
        expect(insideLake(point.x - tangent.z * lateral, point.z + tangent.x * lateral), `água sobre a pista em t=${t}`).toBe(false);
      }
    }
  });

  it("deixa a faixa central livre dos obstáculos estáticos", () => {
    for (const obstacle of vanillaLakeLayout.obstacles) {
      expect(obstacle.lateral - obstacle.size / 2).toBeGreaterThan(3.5);
      expect(obstacle.lateral + obstacle.size / 2).toBeLessThan(vanillaLakeLayout.width / 2);
    }
  });
});
