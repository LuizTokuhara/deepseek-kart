import type { SongDefinition } from "../../../audio/music";

// Tema: arpejo sincopado do lead quadrado, com os metais empurrando a base.
const THEME = [
  "a4:2 d5:2 f#5:3 e5:3 d5:2 a4:4",
  "b4:2 d5:2 f#5:3 e5:3 d5:2 b4:4",
  "g4:2 b4:2 d5:4 e5:2 f#5:2 g5:4",
  "a5:6 g5:2 f#5:2 e5:2 c#5:4",
  "a4:2 d5:2 f#5:3 e5:3 d5:2 a5:4",
  "b5:2 a5:2 f#5:4 d5:2 e5:2 f#5:4",
  "g5:4 f#5:2 e5:2 e5:2 f#5:2 g5:2 a5:2",
  "f#5:6 e5:2 d5:4 .:2 a4:2",
].join(" | ");

// Refrão de metais em terças.
const CHORUS = [
  "b4:4 d5:4 g5:6 f#5:2",
  "e5:4 c#5:4 a4:6 b4:2",
  "c#5:4 f#5:4 a5:4 f#5:4",
  "b5:6 a5:2 f#5:4 d5:4",
  "g5:4 e5:4 b4:4 d5:4",
  "c#5:4 e5:4 a5:4 c#6:4",
  "d6:6 b5:2 g5:4 a5:2 b5:2",
  "a5:2 .:2 a5:2 .:2 g5:2 e5:2 c#5:2 b4:2",
].join(" | ");

// Clímax ♭VI–♭VII–I: a cadência de vitória que leva de volta ao tema.
const FINALE = [
  "f5:6 d5:2 bb4:4 c5:2 d5:2",
  "e5:6 g5:2 c6:4 b5:2 c6:2",
  "d6:12 .:2 a5:2",
  "f#5:2 a5:2 d6:2 f#6:2 e6:4 d6:4",
  "f6:6 d6:2 bb5:4 c6:2 d6:2",
  "e6:6 g6:2 e6:4 d6:2 c6:2",
  "d6:4 a5:4 f#5:4 a5:4",
  "g5:4 e5:4 c#5:4 b4:2 g4:2",
].join(" | ");

const THEME_CHORDS = "D | Bm | G | A | D | Bm | G A | D";

/** "Meadow Grand Prix": pop-rock de circuito em Ré maior. */
export const meadowLoopMusic: SongDefinition = {
  title: "Meadow Grand Prix",
  bpm: 152,
  finalLapTempo: 1.12,
  key: { tonic: "d", mode: "major" },
  voices: { lead: "square", comp: "brass", bass: "slap" },
  patterns: {
    bass: "r - o - r - o - r - o - 5 - a -",
    comp: "X - . x - . . . . . x - . x - .",
    drums: {
      kick: "x . . . . . x . x . . . . . . .",
      snare: ". . . . x . . . . . . g x . . .",
      hat: "X . x . X . x . X . x . X . . .",
      openHat: ". . . . . . . . . . . . . . x .",
    },
    fill: {
      kick: "x . . . . . x . x . . . . . . .",
      snare: ". . . . x . . . x . x x . . . .",
      hat: "x . x . x . x . . . . . . . . .",
      tomHigh: ". . . . . . . . . . . . x x . .",
      tomLow: ". . . . . . . . . . . . . . x x",
    },
  },
  intro: [{ chords: "D | A", lead: ".:16 | .:8 e4:2 f#4:2 g4:2 g#4:2" }],
  loop: [
    { chords: THEME_CHORDS, lead: THEME },
    {
      chords: "G | A | F#m | Bm | Em7 | A | G | A7",
      lead: CHORUS,
      leadVoice: "brass",
      harmony: true,
    },
    { chords: THEME_CHORDS, lead: THEME, harmony: true },
    { chords: "Bb | C | D | D | Bb | C | D | Em7 A7", lead: FINALE, leadVoice: "brass" },
  ],
};
