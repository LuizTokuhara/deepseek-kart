import type { SongDefinition } from "../../../audio/music";

// Main theme: steel drum in tresillo rhythm (3+3+2) over the lagoon.
const THEME_HEAD = [
  "c6:3 a5:3 f5:2 g5:2 a5:2 c6:4",
  "d6:3 a5:3 f5:2 e5:2 f5:2 a5:4",
  "bb5:3 f5:3 d5:2 bb5:2 c6:2 d6:4",
  "c6:6 bb5:2 a5:4 g5:4",
  "c6:3 a5:3 f5:2 g5:2 a5:2 c6:4",
  "d6:3 f6:3 e6:2 d6:2 c6:2 a5:4",
  "bb5:3 a5:3 g5:2 e6:3 d6:3 c6:2",
  "f6:6 .:2 a5:2 bb5:2 c6:2 d6:2",
].join(" | ");

// Chorus: square lead on long notes, doubled in thirds.
const CHORUS = [
  "f6:6 d6:2 bb5:4 c6:2 d6:2",
  "e6:6 c6:2 g5:4 a5:2 bb5:2",
  "c6:6 a5:2 e5:4 f5:2 g5:2",
  "a5:6 g5:2 f5:2 e5:2 d5:4",
  "d6:6 bb5:2 g5:4 a5:2 bb5:2",
  "c6:4 e6:4 g6:4 e6:4",
  "f6:6 e6:2 d6:4 a5:4",
  "c6:2 bb5:2 a5:2 g5:2 e5:2 f5:2 g5:2 bb5:2",
].join(" | ");

// Bridge: short call and response, with the drums reduced to congas.
const BRIDGE = [
  "a5:2 .:1 a5:1 d6:2 .:2 c6:2 a5:2 .:4",
  ".:8 bb5:2 c6:2 d6:4",
  "c6:2 .:1 c6:1 f6:2 .:2 e6:2 c6:2 .:4",
  ".:8 g5:2 a5:2 bb5:2 c6:2",
  "d6:2 .:1 d6:1 f6:2 .:2 e6:2 d6:2 .:4",
  ".:8 f6:2 e6:2 d6:4",
  "bb5:4 d6:4 g6:4 f6:4",
  "e6:4 c6:4 g5:2 a5:2 bb5:2 .:2",
].join(" | ");

const THEME_CHORDS = "F | Dm | Bb | C | F | Dm | Gm7 C7 | F";

/** "Lagoon Grand Prix": arcade calypso in F major. */
export const deepseekRacewayMusic: SongDefinition = {
  title: "Lagoon Grand Prix",
  bpm: 144,
  finalLapTempo: 1.12,
  key: { tonic: "f", mode: "major" },
  voices: { lead: "steel", comp: "pluck", bass: "slap" },
  patterns: {
    bass: "r - - 5 - - o - r - - 5 - - a -",
    comp: ". . x . . . x - . . x . . . x -",
    drums: {
      kick: "x . . . x . . . x . . . x . . .",
      snare: ". . . . x . . g . . . . x . . g",
      hat: "g . x . g . x . g . x . g . x .",
      congaHigh: ". . . x . . x . . . . x . . x .",
      congaLow: ". . . . . . . . . . x . x . . .",
      shaker: "x g x g x g x g x g x g x g x g",
    },
    lightDrums: {
      kick: "x . . . . . . . x . . . . . . .",
      congaHigh: ". . . x . . x . . . . x . . x .",
      congaLow: ". . . . . . . . . . x . x . . .",
      shaker: "x g x g x g x g x g x g x g x g",
    },
    fill: {
      kick: "x . . . x . . . x . . . . . . .",
      snare: ". . . . x . . . x . x . . . . .",
      hat: "g . x . g . x . . . . . . . . .",
      tomHigh: ". . . . . . . . . . . . x x . .",
      tomLow: ". . . . . . . . . . . . . . x x",
      shaker: "x g x g x g x g x g x g x g x g",
    },
  },
  intro: [{ chords: "F | C7", lead: ".:16 | .:8 g5:2 a5:2 bb5:2 b5:2" }],
  loop: [
    { chords: THEME_CHORDS, lead: THEME_HEAD },
    {
      chords: "Bb | C | Am | Dm | Gm7 | C | Bbmaj7 | C7",
      lead: CHORUS,
      leadVoice: "square",
      harmony: true,
    },
    { chords: THEME_CHORDS, lead: THEME_HEAD, harmony: true },
    { chords: "Dm | Bb | F | C | Dm | Bb | Gm7 | C7", lead: BRIDGE, drums: "light" },
  ],
};
