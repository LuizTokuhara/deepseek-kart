import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AIDriver } from "../src/ai";
import { CollisionWorld } from "../src/collision";
import { ItemSystem } from "../src/items";
import { WrongWayDetector } from "../src/race-flow";
import { Track } from "../src/track";
import {
  DEFAULT_TRACK_DEFINITION,
  DEFAULT_TRACK_STYLE,
  type TrackDefinition,
} from "../src/track-definition";

function createOvalCurve(): THREE.CatmullRomCurve3 {
  const points = Array.from({ length: 12 }, (_, index) => {
    const angle = (index / 12) * Math.PI * 2;
    return new THREE.Vector3(
      Math.cos(angle) * 30,
      0,
      Math.sin(angle) * 18,
    );
  });
  const curve = new THREE.CatmullRomCurve3(
    points,
    true,
    "centripetal",
    0.5,
  );
  curve.arcLengthDivisions = 1000;
  return curve;
}

function createOvalDefinition(): TrackDefinition {
  return {
    id: "test-oval",
    name: "Test Oval",
    curve: createOvalCurve(),
    width: 9,
    sampleStep: 4,
    spawnT: 0,
    surface: "asphalt",
    checkpointTs: [0.25, 0.5, 0.75],
    checkpointRadius: 6,
    itemRows: [
      { t: 0.1, lateral: [-2, 2] },
      { t: 0.6, lateral: [0] },
    ],
    obstacles: [{ t: 0.3, side: 1, lateral: 7, size: 1 }],
    wallGaps: [{ side: 1, from: 0.4, to: 0.45 }],
    bounds: { width: 100, depth: 80 },
    style: {
      ...DEFAULT_TRACK_STYLE,
      roadColor: 0x112233,
      grassColor: 0x445566,
      wallOffset: 5.5,
      startLine: {
        ...DEFAULT_TRACK_STYLE.startLine,
        width: 9,
      },
    },
  };
}

describe("track definition", () => {
  it("mantém a pista padrão com os mesmos dados de corrida", () => {
    const track = new Track();

    expect(track.definition.id).toBe("deepseek-raceway");
    expect(track.width).toBe(12);
    expect(track.checkpointRadius).toBe(7.5);
    expect(track.path.length).toBeGreaterThan(100);
    expect(track.pathSpacing).toBeGreaterThan(0);
    expect(track.checkpoints).toHaveLength(3);
    expect(track.itemBoxes).toHaveLength(12);
    expect(track.surfaceAt(track.spawn.pos.x, track.spawn.pos.z)).toBe("dirt");
    expect(track.surfaceAt(0, 0)).toBe("grass");
  });

  it("constrói uma pista completa a partir de uma definição própria", () => {
    const definition = createOvalDefinition();
    const track = new Track(definition);

    expect(track.definition).toBe(definition);
    expect(track.width).toBe(9);
    expect(track.wallOffset).toBe(5.5);
    expect(track.checkpointRadius).toBe(6);
    expect(track.path.length).toBeGreaterThan(0);
    expect(track.checkpoints).toHaveLength(3);
    expect(track.itemBoxes).toHaveLength(3);
    expect(track.bounds).toEqual({
      minX: -50,
      maxX: 50,
      minZ: -40,
      maxZ: 40,
    });
    expect(track.surfaceAt(track.spawn.pos.x, track.spawn.pos.z)).toBe(
      "asphalt",
    );
    expect(track.surfaceAt(0, 0)).toBe("grass");
    expect(track.pathSpacing).toBeCloseTo(
      definition.curve.getLength() / track.path.length,
      8,
    );
  });

  it("reutiliza itens, IA e detector de contramão com outra pista", () => {
    const track = new Track(createOvalDefinition());
    const collision = new CollisionWorld(track.colliders);
    const items = new ItemSystem(track, collision);
    const ai = new AIDriver(track);
    const wrongWay = new WrongWayDetector(track);

    expect(items.group.children).toHaveLength(3);
    expect(ai.update).toBeTypeOf("function");
    expect(wrongWay.update).toBeTypeOf("function");
    expect(track.definition).not.toBe(DEFAULT_TRACK_DEFINITION);
  });
});
