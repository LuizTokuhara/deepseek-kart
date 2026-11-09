import type { SongDefinition } from "../../../audio/music";

// Theme: dotted-quarter and eighth-note phrases, which the swing makes bounce.
const THEME_BARS = [
  "bb5:6 g5:2 eb5:4 f5:2 g5:2",
  "c6:6 bb5:2 g5:4 eb5:4",
  "ab5:2 c6:2 eb6:2 c6:2 ab5:4 f5:4",
  "d6:6 c6:2 bb5:4 ab5:4",
  "g5:2 bb5:2 d6:2 eb6:2 d6:4 bb5:4",
  "c6:2 eb6:2 g6:4 f6:2 eb6:2 c6:4",
  "ab5:4 c6:4 d6:4 f6:4",
];
/** First time: rises chromatically to the C of the chorus. */
const THEME = [...THEME_BARS, "eb6:8 .:4 bb5:2 b5:2"].join(" | ");
/** Repetition in thirds: rises to the high G of the bridge. */
const THEME_REPRISE = [...THEME_BARS, "eb6:8 .:4 f6:2 f#6:2"].join(" | ");

const CHORUS = [
  "c6:6 eb6:2 g6:4 eb6:4",
  "f6:6 d6:2 bb5:4 g5:4",
  "ab5:2 bb5:2 c6:2 eb6:2 f6:4 eb6:2 c6:2",
  "d6:4 bb5:4 ab5:4 f5:4",
  "eb5:2 g5:2 c6:2 eb6:2 g6:8",
  "f6:4 d6:4 e6:4 c6:4",
  "c6:6 ab5:2 f5:4 ab5:4",
  "f5:2 ab5:2 bb5:2 d6:2 f6:4 d6:2 c6:2",
].join(" | ");

// Bridge with a minor borrowing (Abm6) before returning to the theme.
const BRIDGE = [
  "g6:6 f6:2 d6:4 bb5:4",
  "e6:6 g6:2 bb6:4 g6:4",
  "ab6:6 g6:2 f6:4 c6:4",
  "d6:6 f6:2 ab5:4 bb5:4",
  "c6:4 eb6:4 g6:4 eb6:4",
  "b5:6 ab5:2 f5:4 eb5:4",
  "eb5:2 g5:2 bb5:2 d6:2 eb6:8",
  "c6:4 ab5:4 d6:4 f5:2 ab5:2",
].join(" | ");

const THEME_CHORDS = "Ebmaj7 | Cm7 | Fm7 | Bb7 | Ebmaj7 | Cm7 | Fm7 Bb7 | Ebmaj7";

/** "Vanilla Lake Swing": fast winter jazz in E-flat major. */
export const vanillaLakeMusic: SongDefinition = {
  title: "Vanilla Lake Swing",
  bpm: 168,
  finalLapTempo: 1.1,
  swing: 0.6,
  key: { tonic: "eb", mode: "major" },
  voices: { lead: "bell", comp: "keys", bass: "upright" },
  patterns: {
    // Walking bass: root, third, fifth, and chromatic approach.
    bass: "r - - - 3 - - - 5 - - - a - - -",
    comp: "x - - - . . x - . . . . . . x -",
    drums: {
      kick: "x . . . . . . . x . . . . . . .",
      snare: ". . . . x . . . . . . . x . . .",
      ride: "x . . . x . x . x . . . x . x .",
      hat: ". . . . x . . . . . . . x . . .",
      sleigh: ". . . . X . . . . . . . X . . .",
    },
    lightDrums: {
      ride: "x . . . x . x . x . . . x . x .",
      hat: ". . . . x . . . . . . . x . . .",
    },
    fill: {
      kick: "x . . . . . . . x . . . . . . .",
      ride: "x . . . x . x . . . . . . . . .",
      snare: ". . . . . . . . x . x . . . . .",
      tomHigh: ". . . . . . . . . . . . x . . .",
      tomLow: ". . . . . . . . . . . . . . x .",
      sleigh: ". . . . X . . . . . . . . . . .",
    },
  },
  intro: [{ chords: "Ebmaj7 | Bb7", lead: ".:16 | .:8 f5:2 g5:2 ab5:2 a5:2", drums: "light" }],
  loop: [
    { chords: THEME_CHORDS, lead: THEME },
    { chords: "Abmaj7 | Gm7 | Fm7 | Bb7 | Abmaj7 | Gm7 C7 | Fm7 | Bb7", lead: CHORUS },
    { chords: THEME_CHORDS, lead: THEME_REPRISE, harmony: true },
    { chords: "Gm7 | C7 | Fm7 | Bb7 | Abmaj7 | Abm6 | Ebmaj7 | Fm7 Bb7", lead: BRIDGE },
  ],
};
