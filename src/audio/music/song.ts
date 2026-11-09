import {
  STEPS_PER_BAR,
  parseChords,
  parseMelody,
  parsePattern,
  parsePitch,
  pitchClass,
  type Chord,
} from "./notation";
import type {
  CompVoice,
  CompiledSong,
  CompiledStep,
  DrumPatterns,
  DrumVoice,
  ScaleMode,
  SongDefinition,
  SongSection,
} from "./types";

const SCALES: Readonly<Record<ScaleMode, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  "phrygian-dominant": [0, 1, 4, 5, 7, 8, 10],
};
/** Center of each accompaniment timbre, for close voicings without leaps. */
const COMP_CENTER: Readonly<Record<CompVoice, number>> = {
  brass: 65, pluck: 62, keys: 64, steel: 72,
};
const BASS_LOW = 36;
const HIT_VELOCITY: Readonly<Record<string, number>> = { x: 0.8, X: 1, g: 0.35 };

/** Places a pitch class in the [low, low + 12) register. */
function inRegister(pitch: number, low: number): number {
  return low + pitchClass(pitch - low);
}

/** Chord in close position around `center`; the voice leading stays smooth by itself. */
export function voiceChord(chord: Chord, center: number): number[] {
  return chord.intervals
    .map((interval) => inRegister(chord.root + interval, center - 6))
    .sort((a, b) => a - b);
}

/** Diatonic third below, preferring chord tones. */
export function harmonize(midi: number, chord: Chord, scale: ReadonlySet<number>): number {
  const tones = new Set(chord.intervals.map((interval) => pitchClass(chord.root + interval)));
  const thirds = [midi - 3, midi - 4].filter((note) => scale.has(pitchClass(note)));
  const third = thirds.find((note) => tones.has(pitchClass(note))) ?? thirds[0];
  if (third !== undefined) return third;
  // Chromatic note: looks for the nearest chord tone below.
  for (let note = midi - 3; note > midi - 10; note--) {
    if (tones.has(pitchClass(note))) return note;
  }
  return midi - 12;
}

/** Next scale note above; outside the scale, a whole tone. */
function scaleNeighbor(midi: number, scale: ReadonlySet<number>): number {
  if (!scale.has(pitchClass(midi))) return midi + 2;
  for (let step = 1; step <= 3; step++) {
    if (scale.has(pitchClass(midi + step))) return midi + step;
  }
  return midi + 2;
}

function bassNote(
  token: string,
  chord: Chord,
  next: Chord,
  scale: ReadonlySet<number>,
): number | null {
  const bass = inRegister(chord.bass, BASS_LOW);
  const root = inRegister(chord.root, BASS_LOW);
  switch (token) {
    case "r": return bass;
    case "o": return bass + 12;
    case "5": return root + (chord.intervals[2] ?? 7);
    case "3": return root + chord.intervals[1];
    case "7": return root + (chord.intervals[3] ?? 10);
    case "n": return scaleNeighbor(bass, scale);
    case "a": return inRegister(next.bass, BASS_LOW) - 1;
    default: return null;
  }
}

interface Placement {
  readonly start: number;
  readonly bars: number;
  readonly section: SongSection;
}

/** Converts the definition into per-sixteenth events, with chords and timbres already set. */
export function compileSong(song: SongDefinition): CompiledSong {
  const sections = [...song.intro, ...song.loop];
  const tonic = parsePitch(`${song.key.tonic}4`);
  const scale = new Set(SCALES[song.key.mode].map((interval) => pitchClass(tonic + interval)));
  const steps: CompiledStep[] = [];
  const placements: Placement[] = [];

  for (const section of sections) {
    const { changes, bars } = parseChords(section.chords);
    const start = steps.length;
    placements.push({ start, bars, section });
    let change = 0;
    for (let step = 0; step < bars * STEPS_PER_BAR; step++) {
      if (changes[change + 1]?.step === step) change++;
      steps.push({ chord: changes[change].chord, notes: [], hits: [] });
    }
  }

  const loopStart = placements[song.intro.length]?.start ?? 0;
  const loopLength = steps.length - loopStart;
  // After the last step the music returns to the start of the loop, not the intro.
  const chordAt = (step: number): Chord =>
    steps[step < steps.length ? step : loopStart + ((step - loopStart) % loopLength)].chord;

  placements.forEach((placement, index) => {
    // Crash on every section entry, except on the first beat of GO.
    const opening = index === 0 && song.intro.length > 0;
    addLead(steps, placement, song, scale);
    if (placement.section.comp !== false) addComp(steps, placement, song);
    if (placement.section.bass !== false) addBass(steps, placement, song, chordAt, scale);
    addDrums(steps, placement, song, !opening);
  });

  return {
    title: song.title,
    stepSeconds: 60 / song.bpm / 4,
    finalLapTempo: song.finalLapTempo,
    swing: song.swing ?? 0,
    loopStart,
    steps,
  };
}

function addLead(
  steps: CompiledStep[],
  { start, bars, section }: Placement,
  song: SongDefinition,
  scale: ReadonlySet<number>,
): void {
  if (!section.lead) return;
  const melody = parseMelody(section.lead);
  if (melody.bars !== bars) {
    throw new Error(
      `Melodia com ${melody.bars} compassos para ${bars} de cifras em "${song.title}"`,
    );
  }
  const voice = section.leadVoice ?? song.voices.lead;
  for (const note of melody.notes) {
    const step = start + note.step;
    const velocity = note.step % 4 === 0 ? 1 : note.step % 2 === 0 ? 0.9 : 0.8;
    steps[step].notes.push({ layer: "lead", voice, midi: note.midi, steps: note.steps, velocity });
    if (section.harmony) {
      const midi = harmonize(note.midi, steps[step].chord, scale);
      steps[step].notes.push({ layer: "harmony", voice, midi, steps: note.steps, velocity });
    }
  }
}

/** Duration until the next hit, rest, chord change or end of section. */
function holdLength(pattern: string[], from: number, end: number, steps: CompiledStep[]): number {
  let length = 1;
  while (
    from + length < end &&
    pattern[(from + length) % pattern.length] === "-" &&
    steps[from + length].chord === steps[from].chord
  ) {
    length++;
  }
  return length;
}

function addComp(steps: CompiledStep[], { start, bars }: Placement, song: SongDefinition): void {
  const pattern = parsePattern(song.patterns.comp);
  const voice = song.voices.comp;
  const length = bars * STEPS_PER_BAR;
  const sectionSteps = steps.slice(start, start + length);
  for (let local = 0; local < length; local++) {
    const token = pattern[local % pattern.length];
    if (token !== "x" && token !== "X") continue;
    const step = sectionSteps[local];
    const held = holdLength(pattern, local, length, sectionSteps);
    for (const midi of voiceChord(step.chord, COMP_CENTER[voice])) {
      step.notes.push({ layer: "comp", voice, midi, steps: held, velocity: HIT_VELOCITY[token] });
    }
  }
}

function addBass(
  steps: CompiledStep[],
  { start, bars }: Placement,
  song: SongDefinition,
  chordAt: (step: number) => Chord,
  scale: ReadonlySet<number>,
): void {
  const pattern = parsePattern(song.patterns.bass);
  const voice = song.voices.bass;
  const length = bars * STEPS_PER_BAR;
  const sectionSteps = steps.slice(start, start + length);
  for (let local = 0; local < length; local++) {
    const step = sectionSteps[local];
    const changed = local % STEPS_PER_BAR !== 0 && sectionSteps[local - 1].chord !== step.chord;
    let token = pattern[local % pattern.length];
    // Chord change mid-bar: the bass marks the new root.
    if (changed && token !== ".") token = "r";
    const nextBar = start + (Math.floor(local / STEPS_PER_BAR) + 1) * STEPS_PER_BAR;
    const midi = bassNote(token, step.chord, chordAt(nextBar), scale);
    if (midi === null) continue;
    const held = holdLength(pattern, local, length, sectionSteps);
    const velocity = token === "o" ? 1 : local % 4 === 0 ? 0.9 : 0.78;
    step.notes.push({ layer: "bass", voice, midi, steps: held, velocity });
  }
}

function addDrums(
  steps: CompiledStep[],
  { start, bars, section }: Placement,
  song: SongDefinition,
  crashOnEntry: boolean,
): void {
  const mode = section.drums ?? "full";
  if (mode === "none") return;
  const groove =
    mode === "light" ? (song.patterns.lightDrums ?? song.patterns.drums) : song.patterns.drums;
  const length = bars * STEPS_PER_BAR;
  const fillFrom = section.fill === false ? Infinity : length - STEPS_PER_BAR;
  const parsed = (patterns: DrumPatterns) =>
    Object.entries(patterns).map(
      ([drum, source]) => [drum as DrumVoice, parsePattern(source)] as const,
    );
  const grooveTracks = parsed(groove);
  const fillTracks = parsed(song.patterns.fill);

  for (let local = 0; local < length; local++) {
    const tracks = local >= fillFrom ? fillTracks : grooveTracks;
    const hits = steps[start + local].hits;
    for (const [drum, pattern] of tracks) {
      const velocity = HIT_VELOCITY[pattern[local % pattern.length]];
      if (velocity) hits.push({ drum, velocity });
    }
  }
  if (crashOnEntry && mode === "full" && !steps[start].hits.some((hit) => hit.drum === "crash")) {
    steps[start].hits.push({ drum: "crash", velocity: 0.9 });
  }
}
