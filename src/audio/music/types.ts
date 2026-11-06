import type { Chord } from "./notation";

/** Tipos das trilhas: a definição escrita por pista e o resultado compilado. */

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
  /** Cifras por compasso; definem o tamanho da seção. */
  readonly chords: string;
  readonly lead?: string;
  readonly leadVoice?: LeadVoice;
  /** Dobra a melodia uma terça diatônica abaixo. */
  readonly harmony?: boolean;
  /** "light" usa o groove leve do tema; "none" deixa só a harmonia. */
  readonly drums?: "full" | "light" | "none";
  readonly comp?: boolean;
  readonly bass?: boolean;
  /** Virada de bateria no último compasso; padrão: sim. */
  readonly fill?: boolean;
}

/** Tema de uma pista: andamento, timbres, grooves e seções. */
export interface SongDefinition {
  readonly title: string;
  readonly bpm: number;
  /** Multiplicador de andamento na volta final. */
  readonly finalLapTempo: number;
  /** Atraso das colcheias do contratempo, em passos (0,67 ≈ tercina). */
  readonly swing?: number;
  readonly key: { readonly tonic: string; readonly mode: ScaleMode };
  readonly voices: {
    readonly lead: LeadVoice;
    readonly comp: CompVoice;
    readonly bass: BassVoice;
  };
  readonly patterns: {
    /**
     * r fundamental, o oitava, 5 quinta, 3 terça, 7 sétima, n vizinha na
     * escala, a aproximação cromática do próximo compasso, - sustenta, . pausa.
     */
    readonly bass: string;
    /** x ataque, X acento, - sustenta, . pausa. */
    readonly comp: string;
    /** x normal, X acento, g nota fantasma, . nada. */
    readonly drums: DrumPatterns;
    readonly lightDrums?: DrumPatterns;
    readonly fill: DrumPatterns;
  };
  /** Toca uma vez a partir do GO. */
  readonly intro: readonly SongSection[];
  /** Repete até o fim da corrida; a volta final recomeça daqui. */
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
  /** Primeiro passo depois da introdução. */
  readonly loopStart: number;
  readonly steps: readonly CompiledStep[];
}
