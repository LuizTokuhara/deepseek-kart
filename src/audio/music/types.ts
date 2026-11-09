import type { Chord } from "./notation";

/** Song types: the definition written per course and the compiled result. */

export type LeadVoice = "square" | "brass" | "steel" | "bell" | "reed";
export type CompVoice = "brass" | "pluck" | "keys" | "steel";
export type BassVoice = "slap" | "synth" | "upright";
export type MelodicVoice = LeadVoice | CompVoice | BassVoice;
export type DrumVoice =
  | "kick" | "snare" | "rim" | "clap" | "hat" | "openHat" | "ride" | "crash"
  | "tomHigh" | "tomLow" | "congaHigh" | "congaLow" | "shaker" | "sleigh";
export type MusicLayer = "lead" | "harmony" | "comp" | "bass";
export type DrumPatterns = Partial<Record<DrumVoice, string>>;
export type ScaleMode = "major" | "minor" | "phrygian-dominant";

export interface SongSection {
  /** Chords per bar; they define the section length. */
  readonly chords: string;
  readonly lead?: string;
  readonly leadVoice?: LeadVoice;
  /** Doubles the melody a diatonic third below. */
  readonly harmony?: boolean;
  /** "light" uses the theme's light groove; "none" leaves only the harmony. */
  readonly drums?: "full" | "light" | "none";
  readonly comp?: boolean;
  readonly bass?: boolean;
  /** Drum fill on the last bar; default: yes. */
  readonly fill?: boolean;
}

/** Course theme: tempo, timbres, grooves and sections. */
export interface SongDefinition {
  readonly title: string;
  readonly bpm: number;
  /** Tempo multiplier on the final lap. */
  readonly finalLapTempo: number;
  /** Offbeat eighth-note delay, in steps (0.67 ≈ triplet). */
  readonly swing?: number;
  readonly key: { readonly tonic: string; readonly mode: ScaleMode };
  readonly voices: {
    readonly lead: LeadVoice;
    readonly comp: CompVoice;
    readonly bass: BassVoice;
  };
  readonly patterns: {
    /**
     * r root, o octave, 5 fifth, 3 third, 7 seventh, n scale neighbor,
     * a chromatic approach to the next bar, - holds, . rest.
     */
    readonly bass: string;
    /** x hit, X accent, - holds, . rest. */
    readonly comp: string;
    /** x normal, X accent, g ghost note, . nothing. */
    readonly drums: DrumPatterns;
    readonly lightDrums?: DrumPatterns;
    readonly fill: DrumPatterns;
  };
  /** Plays once from GO. */
  readonly intro: readonly SongSection[];
  /** Repeats until the end of the race; the final lap restarts from here. */
  readonly loop: readonly SongSection[];
}

export interface MusicNote {
  readonly layer: MusicLayer;
  readonly voice: MelodicVoice;
  readonly midi: number;
  readonly steps: number;
  readonly velocity: number;
}

export interface DrumHit {
  readonly drum: DrumVoice;
  readonly velocity: number;
}

export interface CompiledStep {
  readonly chord: Chord;
  readonly notes: MusicNote[];
  readonly hits: DrumHit[];
}

export interface CompiledSong {
  readonly title: string;
  readonly stepSeconds: number;
  readonly finalLapTempo: number;
  readonly swing: number;
  /** First step after the intro. */
  readonly loopStart: number;
  readonly steps: readonly CompiledStep[];
}
