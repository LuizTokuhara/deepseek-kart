import type { SongDefinition } from "../../../audio/music";

// Tema: frase descendente de synth que cai na terça de cada acorde.
const THEME = [
  "c6:3 bb5:3 g5:2 ab5:2 g5:2 eb5:4",
  "d6:3 c6:3 b5:2 g5:4 f5:4",
  "eb5:2 g5:2 bb5:2 c6:4 bb5:2 g5:4",
  "g5:8 .:4 g5:2 ab5:2",
  "c6:3 ab5:3 f5:2 g5:2 ab5:2 c6:4",
  "d6:3 bb5:3 f5:2 ab5:4 bb5:4",
  "g5:2 bb5:2 d6:2 eb6:6 d6:2 bb5:2",
  "b5:6 .:2 d6:2 c6:2 b5:2 g5:2",
].join(" | ");

// Refrão em notas longas, subindo até o Mi bemol agudo.
const CHORUS = [
  "ab5:4 c6:4 eb6:6 c6:2",
  "d6:4 b5:4 g5:6 f5:2",
  "g5:4 bb5:4 c6:6 bb5:2",
  "bb5:6 g5:2 eb5:8",
  "eb6:4 c6:4 ab5:6 g5:2",
  "f5:4 ab5:4 d6:6 c6:2",
  "eb6:4 d6:4 b5:4 d6:4",
  "c6:12 .:4",
].join(" | ");

// Ponte: chamada curta e resposta sobre a bateria leve.
const BRIDGE = [
  "eb5:2 .:2 eb5:2 g5:2 c6:4 .:4",
  "d5:2 .:2 d5:2 f5:2 bb5:4 .:4",
  "d5:2 .:2 d5:2 g5:2 bb5:4 c6:2 bb5:2",
  "g5:12 .:4",
  "f5:2 .:2 f5:2 ab5:2 c6:4 .:4",
  "f5:2 .:2 f5:2 bb5:2 d6:4 .:4",
  "eb6:4 d6:4 bb5:4 g5:4",
  "f5:4 g5:4 b5:4 d6:4",
].join(" | ");

const THEME_CHORDS = "Abmaj7 | G7 | Cm7 | Cm7 | Fm7 | Bb7 | Ebmaj7 | G7";

/** "Midnight Overpass": synth-funk noturno em Dó menor, com baixo slap. */
export const lamplightCityMusic: SongDefinition = {
  title: "Midnight Overpass",
  bpm: 126,
  finalLapTempo: 1.1,
  key: { tonic: "c", mode: "minor" },
  voices: { lead: "square", comp: "keys", bass: "slap" },
  patterns: {
    bass: "r . r o . r 5 . r . o . 5 7 a .",
    comp: ". . x . . x . . . . x . . x . .",
    drums: {
      kick: "x . . . . . . x . . x . . . . .",
      snare: ". . . . x . . . . . . . x . . .",
      clap: ". . . . x . . . . . . . x . . .",
      hat: "x g x g x g x g x g x g x g x g",
      openHat: ". . . . . . . . . . . . . . x .",
    },
    lightDrums: {
      kick: "x . . . . . . . x . . . . . . .",
      rim: ". . . . x . . . . . . . x . . .",
      hat: "x . x . x . x . x . x . x . x .",
    },
    fill: {
      kick: "x . . . . . . x . . . . . . . .",
      snare: ". . . . x . . . x . x . x x x x",
      tomHigh: ". . . . . . . . . x . x . . . .",
      tomLow: ". . . . . . . . . . . . . . x x",
    },
  },
  intro: [{ chords: "Cm7 | G7", lead: ".:16 | .:8 g5:2 b5:2 d6:2 f6:2", drums: "light" }],
  loop: [
    { chords: THEME_CHORDS, lead: THEME },
    { chords: "Fm7 | G7 | Cm7 | Ebmaj7 | Abmaj7 | Bb7 | Ebmaj7 G7 | Cm7", lead: CHORUS },
    { chords: THEME_CHORDS, lead: THEME, harmony: true },
    { chords: "Abmaj7 | Bb7 | Gm7 | Cm7 | Fm7 | Bb7 | Ebmaj7 | G7", lead: BRIDGE, drums: "light" },
  ],
};
