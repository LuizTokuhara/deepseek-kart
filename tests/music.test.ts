import { describe, expect, it } from "vitest";
import {
  STEPS_PER_BAR,
  chordTones,
  parseChord,
  parseChords,
  parseMelody,
  parsePattern,
  parsePitch,
  pitchClass,
} from "../src/audio/music/notation";
import type { SongDefinition } from "../src/audio/music";
import { compileSong, harmonize, voiceChord } from "../src/audio/music/song";
import { courses } from "../src/tracks/registry";

const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);

describe("music notation", () => {
  it("should read note names as MIDI numbers with c4 = 60", () => {
    expect(parsePitch("c4")).toBe(60);
    expect(parsePitch("f#5")).toBe(78);
    expect(parsePitch("bb3")).toBe(58);
  });

  it("should read chord qualities and slash basses", () => {
    const chord = parseChord("Bbmaj7");
    const slash = parseChord("C/E");

    expect([...chordTones(chord)].sort((a, b) => a - b)).toEqual([2, 5, 9, 10]);
    expect(slash.root).toBe(0);
    expect(slash.bass).toBe(4);
  });

  it("should place notes and rests on the sixteenth-note grid", () => {
    const { notes, bars } = parseMelody("c5:4 .:4 e5:2 g5:6");

    expect(bars).toBe(1);
    expect(notes.map((note) => [note.step, note.steps])).toEqual([[0, 4], [8, 2], [10, 6]]);
  });

  it("should reject a melody bar that does not add up to 16 steps", () => {
    expect(() => parseMelody("c5:4 e5:4 | g5:16")).toThrow(/Compasso 1/);
  });

  it("should split a bar evenly between its chords", () => {
    const { changes } = parseChords("F | Gm7 C7");

    expect(changes.map((change) => change.step)).toEqual([0, 16, 24]);
    expect(() => parseChords("F G A")).toThrow();
  });

  it("should reject rhythm patterns that do not fill whole bars", () => {
    expect(() => parsePattern("x . x .")).toThrow();
    expect(parsePattern("x . . . x . . . x . . . x . . .")).toHaveLength(STEPS_PER_BAR);
  });
});

describe("arranging helpers", () => {
  it("should harmonize a diatonic third below, preferring chord tones", () => {
    const cMajor = parseChord("C");

    expect(harmonize(parsePitch("e5"), cMajor, C_MAJOR)).toBe(parsePitch("c5"));
    expect(harmonize(parsePitch("g5"), cMajor, C_MAJOR)).toBe(parsePitch("e5"));
  });

  it("should voice chords closely around the requested centre", () => {
    const voicing = voiceChord(parseChord("Fmaj7"), 64);

    expect(voicing).toEqual([...voicing].sort((a, b) => a - b));
    expect(Math.min(...voicing)).toBeGreaterThanOrEqual(58);
    expect(Math.max(...voicing)).toBeLessThan(70);
    expect(new Set(voicing.map(pitchClass))).toEqual(chordTones(parseChord("Fmaj7")));
  });
});

describe.each(courses)("$layout.name soundtrack", (course) => {
  const song: SongDefinition = course.music;
  const compiled = compileSong(song);
  const notes = (layer: string) =>
    compiled.steps.flatMap((step, index) =>
      step.notes.filter((note) => note.layer === layer).map((note) => ({ ...note, index, step })),
    );

  it("should compile an intro followed by a loop of whole bars", () => {
    expect(compiled.steps.length % STEPS_PER_BAR).toBe(0);
    expect(compiled.loopStart % STEPS_PER_BAR).toBe(0);
    expect(compiled.loopStart).toBeGreaterThan(0);
    // At least ~40 s of loop, so the music does not get tiring during laps.
    const loopSeconds = (compiled.steps.length - compiled.loopStart) * compiled.stepSeconds;
    expect(loopSeconds).toBeGreaterThan(40);
  });

  it("should land the melody on chord tones on every downbeat and chord change", () => {
    for (const note of notes("lead")) {
      const changed = note.index > 0 && compiled.steps[note.index - 1].chord !== note.step.chord;
      if (note.index % STEPS_PER_BAR !== 0 && !changed) continue;
      expect(
        chordTones(note.step.chord).has(pitchClass(note.midi)),
        `${song.title}: nota ${note.midi} sobre ${note.step.chord.symbol} no passo ${note.index}`,
      ).toBe(true);
    }
  });

  it("should keep each layer in a playable register", () => {
    for (const note of notes("lead")) expect(note.midi).toBeGreaterThanOrEqual(55);
    for (const note of notes("lead")) expect(note.midi).toBeLessThanOrEqual(96);
    for (const note of notes("bass")) expect(note.midi).toBeGreaterThanOrEqual(28);
    for (const note of notes("bass")) expect(note.midi).toBeLessThan(60);
  });

  it("should give every loop section a melody, a bass line and a crash on entry", () => {
    expect(song.loop.every((section) => section.lead)).toBe(true);
    expect(notes("bass").length).toBeGreaterThan(0);
    const fullSections = song.loop.filter((section) => (section.drums ?? "full") === "full");
    const crashes = compiled.steps.filter((step) => step.hits.some((hit) => hit.drum === "crash"));
    expect(crashes.length).toBeGreaterThanOrEqual(fullSections.length);
  });

  it("should speed up for the final lap", () => {
    expect(compiled.finalLapTempo).toBeGreaterThan(1);
  });
});
