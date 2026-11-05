import { describe, expect, it } from "vitest";
import { FIXED_DT, RACE } from "../src/config";
import { RaceCountdown, WrongWayDetector } from "../src/race-flow";
import { Track } from "../src/track";

describe("race countdown", () => {
  it("conta 3, 2, 1, GO e trava os controles até o GO", () => {
    const countdown = new RaceCountdown(3, 0.5);

    expect(countdown.label).toBe("3");
    expect(countdown.locked).toBe(true);

    expect(countdown.update(1).label).toBe("2");
    expect(countdown.update(1).label).toBe("1");
    expect(countdown.locked).toBe(true);

    const go = countdown.update(1);
    expect(go.label).toBe("GO!");
    expect(go.locked).toBe(false);
    expect(go.startedNow).toBe(true);

    expect(countdown.update(0.6).label).toBeNull();
    expect(countdown.update(1).startedNow).toBe(false);
  });

  it("reinicia o countdown", () => {
    const countdown = new RaceCountdown(3, 0.5);
    countdown.update(4);
    countdown.reset();

    expect(countdown.label).toBe("3");
    expect(countdown.locked).toBe(true);
  });
});

describe("wrong way", () => {
  function stateAtSpawn(track: Track, direction: 1 | -1, speed = 10) {
    const forwardX = Math.sin(track.spawn.yaw) * direction;
    const forwardZ = Math.cos(track.spawn.yaw) * direction;
    return {
      pos: { x: track.spawn.pos.x, z: track.spawn.pos.z },
      vel: { x: forwardX * speed, z: forwardZ * speed },
      yaw: track.spawn.yaw,
      spinTimer: 0,
    };
  }

  function updates(detector: WrongWayDetector, state: ReturnType<typeof stateAtSpawn>, seconds: number): boolean {
    const ticks = Math.ceil(seconds / FIXED_DT);
    let active = false;
    for (let i = 0; i < ticks; i++) {
      active = detector.update(state, FIXED_DT);
    }
    return active;
  }

  it("não ativa quando o kart segue a centerline", () => {
    const track = new Track();
    const detector = new WrongWayDetector(track);
    expect(updates(detector, stateAtSpawn(track, 1), 1.5)).toBe(false);
  });

  it("ativa ao andar contra a centerline depois da persistência", () => {
    const track = new Track();
    const detector = new WrongWayDetector(track);
    expect(updates(detector, stateAtSpawn(track, -1), RACE.wrongWayTime - 0.2)).toBe(false);
    expect(updates(detector, stateAtSpawn(track, -1), 0.4)).toBe(true);
  });

  it("não ativa parado, girando ou com o detector reiniciado", () => {
    const track = new Track();
    const detector = new WrongWayDetector(track);

    const stopped = stateAtSpawn(track, -1, 0);
    expect(updates(detector, stopped, 1)).toBe(false);

    const spinning = stateAtSpawn(track, -1);
    spinning.spinTimer = 1;
    expect(updates(detector, spinning, 1)).toBe(false);

    detector.reset();
    expect(updates(detector, stateAtSpawn(track, -1), RACE.wrongWayTime + 0.2)).toBe(true);
  });
});
