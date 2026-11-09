import type { SongDefinition } from "../../../audio/music";

// Theme: the minor second (D–E♭) and the augmented second (E♭–F♯) of the scale.
const THEME_BARS = [
  "d5:2 eb5:2 f#5:4 eb5:2 d5:2 a4:4",
  "g5:2 f#5:2 eb5:4 f#5:2 g5:2 bb5:4",
  "a5:6 g5:2 f#5:4 eb5:2 f#5:2",
  "g5:4 eb5:4 c5:6 d5:2",
  "d5:2 eb5:2 f#5:2 g5:2 a5:4 bb5:2 a5:2",
  "bb5:6 a5:2 g5:4 f#5:2 g5:2",
  "c6:4 bb5:2 a5:2 g5:4 eb5:4",
  "d5:8 .:4 f#4:2 a4:2",
];
const THEME = THEME_BARS.join(" | ");

// Second part in G minor, ending with an ornament on the tonic.
const CHORUS = [
  "bb4:4 d5:4 g5:6 a5:2",
  "a5:4 f5:4 c5:6 d5:2",
  "eb5:4 g5:4 bb5:6 a5:2",
  "a5:6 f#5:2 d5:8",
  "g5:2 a5:2 bb5:2 d6:2 c6:4 bb5:4",
  "c6:2 bb5:2 a5:2 f5:2 a5:4 c6:4",
  "bb5:4 g5:4 eb5:4 f#5:4",
  "f#5:2 g5:1 f#5:1 eb5:4 d5:8",
].join(" | ");

// Bridge on repeated call notes, over prominent percussion.
const BRIDGE = [
  "d5:3 d5:3 f5:2 bb5:4 a5:4",
  "c5:3 c5:3 eb5:2 g5:4 f#5:4",
  "a5:3 a5:3 f#5:2 d5:4 eb5:4",
  "d5:12 .:4",
  "f5:3 f5:3 bb5:2 d6:4 c6:4",
  "eb6:3 eb6:3 c6:2 g5:4 a5:4",
  "bb5:4 g5:4 eb5:4 eb5:2 f#5:2",
  "d6:4 a5:4 f#5:2 eb5:2 d5:4",
].join(" | ");

const THEME_CHORDS = "D | Eb | D | Cm | D | Eb | Cm | D";

/** "Sunstone Caravan": desert in D Phrygian dominant over the maqsum rhythm. */
export const sunstoneRuinsMusic: SongDefinition = {
  title: "Sunstone Caravan",
  bpm: 138,
  finalLapTempo: 1.14,
  key: { tonic: "d", mode: "phrygian-dominant" },
  voices: { lead: "reed", comp: "pluck", bass: "synth" },
  patterns: {
    bass: "r - . r n - r - r - . r 5 - n -",
    comp: ". . x . . . x x . . x . . . x .",
    drums: {
      kick: "x . . . . . . . x . . x . . . .",
      clap: ". . . . x . . . . . . . x . . .",
      hat: "x . x . x . x . x . x . x . x .",
      // Maqsum: doum (low) and tek (rim), with a ghost "ka" between them.
      congaLow: "x . . . . . . . x . . . . . . .",
      rim: ". . x . . . x . . . . . x . . .",
      congaHigh: ". . . g . . . g . . . g . . x g",
    },
    lightDrums: {
      congaLow: "x . . . . . . . x . . . . . . .",
      rim: ". . x . . . x . . . . . x . . .",
      congaHigh: ". . . g . . . g . . . g . . x g",
      shaker: "x g x g x g x g x g x g x g x g",
    },
    fill: {
      kick: "x . . . . . . . x . . . . . . .",
      clap: ". . . . x . . . . . . . . . . .",
      congaLow: "x . . . . . . . . . . . . . . .",
      rim: ". . x . . . x . . . . . . . . .",
      congaHigh: ". . . . . . . . x x x x . . . .",
      tomHigh: ". . . . . . . . . . . . x x . .",
      tomLow: ". . . . . . . . . . . . . . x x",
    },
  },
  intro: [{ chords: "D | D", lead: ".:16 | .:12 bb4:2 c5:2", drums: "light" }],
  loop: [
    { chords: THEME_CHORDS, lead: THEME },
    { chords: "Gm | F | Eb | D | Gm | F | Eb | D", lead: CHORUS },
    { chords: THEME_CHORDS, lead: THEME, harmony: true },
    { chords: "Bb | Cm | D | D | Bb | Cm | Eb | D", lead: BRIDGE, drums: "light" },
  ],
};
