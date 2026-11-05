import { describe, expect, it } from "vitest";
import { CollisionWorld } from "../src/collision";
import { FIXED_DT } from "../src/config";
import { ItemSystem } from "../src/items";
import { Kart } from "../src/kart";
import { Track } from "../src/track";

function setup() {
  const track = new Track();
  const collision = new CollisionWorld(track.colliders);
  const player = new Kart(track.spawn, track, collision);
  const aiSpawn = {
    pos: {
      x: track.spawn.pos.x + Math.sin(track.spawn.yaw) * 10,
      z: track.spawn.pos.z + Math.cos(track.spawn.yaw) * 10,
    },
    yaw: track.spawn.yaw,
  };
  const ai = new Kart(aiSpawn, track, collision);
  const items = new ItemSystem(track, collision);
  return { track, collision, player, ai, items };
}

function updateFor(
  items: ItemSystem,
  player: Kart,
  ai: Kart,
  seconds: number,
  playerRank = 1,
  aiActive = true,
): void {
  const ticks = Math.max(1, Math.round(seconds / FIXED_DT));
  for (let i = 0; i < ticks; i++) {
    items.update(FIXED_DT, player, ai, playerRank, aiActive);
  }
}

describe("items", () => {
  it("pega um item em uma caixa e a caixa respawna", () => {
    const { track, player, ai, items } = setup();
    const box = track.itemBoxes[0];
    player.state.pos.x = box.x;
    player.state.pos.z = box.z;

    items.update(FIXED_DT, player, ai, 1, true);
    expect(player.state.item).not.toBeNull();

    // Libera o slot, sai da caixa e espera o respawn.
    player.state.item = null;
    player.state.pos.x = 0;
    player.state.pos.z = 0;
    updateFor(items, player, ai, 3.2);

    player.state.pos.x = box.x;
    player.state.pos.z = box.z;
    items.update(FIXED_DT, player, ai, 1, true);
    expect(player.state.item).not.toBeNull();
  });

  it("cogumelo ativa o boost e limpa o item", () => {
    const { player, ai, items } = setup();
    player.state.item = "mushroom";

    expect(items.useItem(player, "player")).toBe(true);
    expect(player.state.item).toBeNull();
    expect(player.state.miniTurboTimer).toBeGreaterThan(0);
  });

  it("banana derruba e gira o outro kart", () => {
    const { player, ai, items } = setup();
    player.state.pos.x = 0;
    player.state.pos.z = 0;
    player.state.yaw = 0;
    player.state.item = "banana";

    expect(items.useItem(player, "player")).toBe(true);

    // A banana é deixada 2 m atrás do kart.
    ai.state.pos.x = 0;
    ai.state.pos.z = -2;
    ai.state.spinTimer = 0;
    items.update(FIXED_DT, player, ai, 1, true);

    expect(ai.state.spinTimer).toBeGreaterThan(0);
  });

  it("casco acerta o kart à frente", () => {
    const { track, player, ai, items } = setup();
    player.state.pos.x = track.spawn.pos.x;
    player.state.pos.z = track.spawn.pos.z;
    player.state.yaw = track.spawn.yaw;
    player.state.item = "shell";

    const forwardX = Math.sin(player.state.yaw);
    const forwardZ = Math.cos(player.state.yaw);
    ai.state.pos.x = player.state.pos.x + forwardX * 8;
    ai.state.pos.z = player.state.pos.z + forwardZ * 8;
    ai.state.spinTimer = 0;

    expect(items.useItem(player, "player")).toBe(true);
    updateFor(items, player, ai, 0.5);

    expect(ai.state.spinTimer).toBeGreaterThan(0);
  });

  it("IA usa o item depois de um tempo", () => {
    const { player, ai, items } = setup();
    ai.state.item = "mushroom";

    updateFor(items, player, ai, 1.1);

    expect(ai.state.item).toBeNull();
    expect(ai.state.miniTurboTimer).toBeGreaterThan(0);
  });

  it("um kart atingido perde velocidade e controle", () => {
    const { player, ai, items } = setup();
    player.state.vel.x = 10;
    player.state.vel.z = 5;
    player.state.item = "banana";
    player.state.pos.x = 0;
    player.state.pos.z = 0;
    player.state.yaw = 0;

    items.useItem(player, "player");

    ai.state.pos.x = 0;
    ai.state.pos.z = -2;
    ai.state.vel.x = 5;
    ai.state.vel.z = 0;
    items.update(FIXED_DT, player, ai, 1, true);

    expect(ai.state.spinTimer).toBeCloseTo(1);
    expect(Math.hypot(ai.state.vel.x, ai.state.vel.z)).toBeLessThan(2);
  });
});
