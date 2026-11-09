import { racewayLayout } from "../src/tracks/courses/deepseek-raceway/layout";
import { describe, expect, it } from "vitest";
import { CollisionWorld } from "../src/core/collision";
import { FIXED_DT } from "../src/core/config";
import { ItemSystem, itemHitLabel, itemLabel } from "../src/items";
import { Kart } from "../src/actors/kart/kart";
import { Track } from "../src/tracks/track";

function setup() {
  const track = new Track(racewayLayout);
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

  it("raio ativa o boost e limpa o item", () => {
    const { player, ai, items } = setup();
    player.state.item = "lightning";

    expect(items.useItem(player, "player")).toBe(true);
    expect(player.state.item).toBeNull();
    expect(player.state.miniTurboTimer).toBeGreaterThan(0);
  });

  it("poça de óleo derruba e gira o outro kart", () => {
    const { player, ai, items } = setup();
    player.state.pos.x = 0;
    player.state.pos.z = 0;
    player.state.yaw = 0;
    player.state.item = "oil-can";

    expect(items.useItem(player, "player")).toBe(true);

    // A lata é derrubada 2 m atrás do kart e deixa a poça no chão.
    ai.state.pos.x = 0;
    ai.state.pos.z = -2;
    ai.state.spinTimer = 0;
    items.update(FIXED_DT, player, ai, 1, true);

    expect(ai.state.spinTimer).toBeGreaterThan(0);
  });

  it("míssil acerta o kart à frente", () => {
    const { track, player, ai, items } = setup();
    player.state.pos.x = track.spawn.pos.x;
    player.state.pos.z = track.spawn.pos.z;
    player.state.yaw = track.spawn.yaw;
    player.state.item = "missile";

    const forwardX = Math.sin(player.state.yaw);
    const forwardZ = Math.cos(player.state.yaw);
    ai.state.pos.x = player.state.pos.x + forwardX * 8;
    ai.state.pos.z = player.state.pos.z + forwardZ * 8;
    ai.state.spinTimer = 0;

    expect(items.useItem(player, "player")).toBe(true);
    expect(items.missileCount).toBe(1);
    updateFor(items, player, ai, 0.5);

    expect(ai.state.spinTimer).toBeGreaterThan(0);
    expect(items.missileCount).toBe(0);
  });

  it("míssil ricocheteia em obstáculo em vez de desaparecer", () => {
    const { track, player, ai, items } = setup();
    player.state.pos.x = track.spawn.pos.x;
    player.state.pos.z = track.spawn.pos.z;
    player.state.yaw = 0;
    player.state.item = "missile";

    expect(items.useItem(player, "player")).toBe(true);
    updateFor(items, player, ai, 0.3);

    expect(items.missileCount).toBe(1);
  });

  it("míssil vermelho persegue e acerta o kart à frente", () => {
    const { player, ai, items } = setup();
    player.state.item = "red-missile";
    player.state.itemCount = 1;

    expect(items.useItem(player, "player")).toBe(true);
    expect(items.missileCount).toBe(1);

    updateFor(items, player, ai, 1.0);

    expect(ai.state.spinTimer).toBeGreaterThan(0);
    expect(items.missileCount).toBe(0);
  });

  it("triplo míssil branco mantém duas cargas após o primeiro disparo", () => {
    const { player, ai, items } = setup();
    player.state.item = "missile";
    player.state.itemCount = 3;

    expect(items.useItem(player, "player")).toBe(true);
    expect(player.state.item).toBe("missile");
    expect(player.state.itemCount).toBe(2);
    expect(items.missileCount).toBe(1);

    items.useItem(player, "player");
    items.useItem(player, "player");

    expect(player.state.item).toBeNull();
    expect(player.state.itemCount).toBe(0);
    expect(items.missileCount).toBe(3);
  });

  it("triplo míssil vermelho dispara três mísseis teleguiados", () => {
    const { player, items } = setup();
    player.state.item = "red-missile";
    player.state.itemCount = 3;

    expect(items.useItem(player, "player")).toBe(true);
    expect(player.state.item).toBe("red-missile");
    expect(player.state.itemCount).toBe(2);
    expect(items.missileCount).toBe(1);

    items.useItem(player, "player");
    items.useItem(player, "player");

    expect(player.state.item).toBeNull();
    expect(items.missileCount).toBe(3);
  });

  it("lata tripla derrama uma poça por uso", () => {
    const { player, ai, items } = setup();
    player.state.item = "oil-can";
    player.state.itemCount = 3;

    expect(items.useItem(player, "player")).toBe(true);
    expect(player.state.item).toBe("oil-can");
    expect(player.state.itemCount).toBe(2);
    expect(items.oilSlickCount).toBe(1);

    items.useItem(player, "player");
    expect(player.state.itemCount).toBe(1);
    expect(items.oilSlickCount).toBe(2);

    items.useItem(player, "player");
    expect(player.state.item).toBeNull();
    expect(items.oilSlickCount).toBe(3);
  });

  it("rotula itens triplos e míssil vermelho", () => {
    expect(itemLabel("red-missile")).toBe("RED MISSILE");
    expect(itemLabel("red-missile", 3)).toBe("RED MISSILE ×3");
    expect(itemLabel("oil-can", 3)).toBe("OIL CAN ×3");
    expect(itemLabel("missile", 3)).toBe("MISSILE ×3");
    expect(itemHitLabel("oil-can")).toBe("OIL SLICK");
    expect(itemHitLabel("red-missile")).toBe("RED MISSILE");
  });

  it("IA usa o item depois de um tempo", () => {
    const { player, ai, items } = setup();
    ai.state.item = "lightning";

    updateFor(items, player, ai, 1.1);

    expect(ai.state.item).toBeNull();
    expect(ai.state.miniTurboTimer).toBeGreaterThan(0);
  });

  it("IA segura o míssil quando o alvo está atrás", () => {
    const { player, ai, items } = setup();
    ai.state.item = "missile";

    updateFor(items, player, ai, 1.5);

    expect(ai.state.item).toBe("missile");
    expect(items.missileCount).toBe(0);
  });

  it("IA dispara o míssil quando o alvo está à frente", () => {
    const { player, ai, items } = setup();
    ai.state.item = "missile";
    const forwardX = Math.sin(ai.state.yaw);
    const forwardZ = Math.cos(ai.state.yaw);
    player.state.pos.x = ai.state.pos.x + forwardX * 8;
    player.state.pos.z = ai.state.pos.z + forwardZ * 8;

    updateFor(items, player, ai, 1.6);

    expect(ai.state.item).toBeNull();
    expect(player.state.spinTimer).toBeGreaterThan(0);
  });

  it("IA derrama óleo quando o jogador está atrás", () => {
    const { player, ai, items } = setup();
    ai.state.item = "oil-can";

    updateFor(items, player, ai, 1.2);

    expect(ai.state.item).toBeNull();
    expect(items.oilSlickCount).toBe(1);
  });

  it("IA guarda o raio para uma reta", () => {
    const { track, player, ai, items } = setup();
    const cornerIndex = track.path.findIndex(
      (_, index) => Math.abs(track.pathYawDelta(index, 4)) > 0.5,
    );
    const straightIndex = track.path.findIndex(
      (_, index) => Math.abs(track.pathYawDelta(index, 4)) < 0.05,
    );

    expect(cornerIndex).toBeGreaterThanOrEqual(0);
    expect(straightIndex).toBeGreaterThanOrEqual(0);

    const corner = track.path[cornerIndex];
    ai.state.pos.x = corner.x;
    ai.state.pos.z = corner.z;
    ai.state.yaw = track.pathYaw(cornerIndex);
    ai.state.item = "lightning";

    updateFor(items, player, ai, 1.5);
    expect(ai.state.item).toBe("lightning");
    expect(ai.state.miniTurboTimer).toBe(0);

    const straight = track.path[straightIndex];
    ai.state.pos.x = straight.x;
    ai.state.pos.z = straight.z;
    ai.state.yaw = track.pathYaw(straightIndex);

    updateFor(items, player, ai, 1.1);
    expect(ai.state.item).toBeNull();
    expect(ai.state.miniTurboTimer).toBeGreaterThan(0);
  });

  it("míssil vermelho mira o adversário imediatamente à frente", () => {
    const { track, collision, player, ai, items } = setup();
    const forwardX = Math.sin(player.state.yaw);
    const forwardZ = Math.cos(player.state.yaw);
    const rival = new Kart(
      {
        pos: {
          x: player.state.pos.x + forwardX * 7,
          z: player.state.pos.z + forwardZ * 7,
        },
        yaw: player.state.yaw,
      },
      track,
      collision,
    );

    player.state.item = "red-missile";
    expect(items.useItem(player, "player")).toBe(true);

    const racers = [
      { id: "ai-1", kart: ai, rank: 1, isPlayer: false },
      { id: "ai-2", kart: rival, rank: 2, isPlayer: false },
      { id: "player", kart: player, rank: 3, isPlayer: true },
    ];
    const ticks = Math.round(0.3 / FIXED_DT);
    for (let tick = 0; tick < ticks; tick++) {
      items.updateField(FIXED_DT, racers);
    }

    expect(rival.state.spinTimer).toBeGreaterThan(0);
    expect(ai.state.spinTimer).toBe(0);
  });

  it("um kart atingido perde velocidade e controle", () => {
    const { player, ai, items } = setup();
    player.state.vel.x = 10;
    player.state.vel.z = 5;
    player.state.item = "oil-can";
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
