import { describe, expect, it } from "vitest";
import { BreakableIce, ICE_ROWS, ICE_SPEED_RETAINED } from "../src/tracks/courses/vanilla-lake/breakable-ice";
import { vanillaLakeLayout } from "../src/tracks/courses/vanilla-lake/layout";
import { Track } from "../src/tracks/track";
import { CollisionWorld, resolveCircleObb } from "../src/core/collision";
import { Kart } from "../src/actors/kart/kart";
import { FIXED_DT, GROUND_Y } from "../src/core/config";

const track = new Track(vanillaLakeLayout);
function setup() {
  const ice = new BreakableIce(track);
  const world = new CollisionWorld([...ice.colliders]);
  const box = ice.colliders[0];
  const spawn = { pos: { x: box.center.x, z: box.center.z }, yaw: box.yaw };
  const kart = new Kart(spawn, track, world);
  kart.state.vel = { x: Math.sin(box.yaw) * 30, z: Math.cos(box.yaw) * 30 };
  return { ice, world, box, spawn, kart };
}

describe("blocos de gelo quebráveis", () => {
  it("quebra uma vez, reduz 40% da velocidade e libera o caminho para todos os karts", () => {
    const { ice, world, box, spawn, kart } = setup();
    world.resolveKart(kart.state);
    expect(kart.speed).toBeCloseTo(30 * ICE_SPEED_RETAINED);
    expect(kart.state.pos).toEqual(spawn.pos);
    expect(box.enabled).toBe(false);
    expect(ice.group.children[0].visible).toBe(false);
    expect(ice.group.children[1].visible).toBe(true);
    for (let i = 0; i < 10; i++) world.resolveKart(kart.state);
    expect(kart.speed).toBeCloseTo(18);
    const rival = new Kart(spawn, track, world);
    rival.state.vel.z = 25;
    world.resolveKart(rival.state);
    expect(rival.speed).toBe(25);
    expect(rival.state.pos).toEqual(spawn.pos);
  });

  it("não deixa colisão invisível para projéteis ou câmera e restaura tudo no reset", () => {
    const { ice, world, box, kart } = setup();
    const ray = () => world.raycast(box.center.x, box.center.y + 4, box.center.z, 0, -1, 0, 8);
    expect(ray()).not.toBeNull();
    world.resolveKart(kart.state);
    expect(resolveCircleObb(box.center.x, box.center.z, 0.3, box)).toBeNull();
    expect(ray()).toBeNull();
    ice.fixedUpdate(0.2);
    expect(ice.group.children[1].children[0].position.length()).toBeGreaterThan(0);
    ice.fixedUpdate(1);
    expect(ice.group.children[1].visible).toBe(false);
    ice.fixedUpdate(60);
    expect(box.enabled).toBe(false);
    ice.reset();
    expect(world.colliders[0]).toBe(ice.colliders[0]);
    expect(box.enabled).toBe(true);
    expect(ice.group.children[0].visible).toBe(true);
    expect(ray()).not.toBeNull();
    world.resolveKart(kart.state);
    expect(kart.speed).toBeCloseTo(18 * ICE_SPEED_RETAINED);
  });

  it("não quebra por aproximação, queda ou salto acima do bloco", () => {
    const { world, box, kart } = setup();
    kart.state.pos.x += Math.cos(box.yaw) * 3;
    kart.state.pos.z -= Math.sin(box.yaw) * 3;
    world.resolveKart(kart.state);
    expect(box.enabled).toBe(true);
    kart.state.pos = { x: box.center.x, z: box.center.z };
    kart.state.height = box.center.y + box.half.y - GROUND_Y + 0.2;
    kart.state.grounded = false;
    world.resolveKart(kart.state);
    expect(box.enabled).toBe(true);
    kart.state.height = 0;
    kart.state.falling = true;
    world.resolveKart(kart.state);
    expect(box.enabled).toBe(true);
    expect(kart.speed).toBeCloseTo(30);
  });

  it("detecta impacto em alta velocidade usando os subpassos reais do kart", () => {
    const { world, box, kart } = setup();
    const forward = { x: Math.sin(box.yaw), z: Math.cos(box.yaw) };
    kart.teleport(box.center.x - forward.x * 4, box.center.z - forward.z * 4, box.yaw);
    kart.state.vel = { x: forward.x * 45, z: forward.z * 45 };
    for (let tick = 0; tick < 20 && box.enabled; tick++) {
      kart.update(FIXED_DT, { throttle: 0, brake: 0, steer: 0, drift: false });
    }
    expect(box.enabled).toBe(false);
    expect(kart.speed).toBeGreaterThan(10);
    expect(kart.speed).toBeLessThan(30);
    expect(world.colliders[0]).toBe(box);
  });

  it("distribui oito blocos em quatro filas com espaço lateral e fora dos buracos", () => {
    const { ice } = setup();
    expect(ice.colliders).toHaveLength(8);
    expect(vanillaLakeLayout.obstacles).toEqual([]);
    for (const row of ICE_ROWS) expect(Math.max(...row.laterals) - Math.min(...row.laterals)).toBe(4);
    for (const box of ice.colliders) {
      expect(track.holeAt(box.center.x, box.center.z)).toBe(false);
      expect(box.center.y - box.half.y).toBeCloseTo(GROUND_Y + track.heightAt(box.center.x, box.center.z));
    }
  });
});
