/**
 * Notação compacta das trilhas. A grade é de semicolcheias: 16 passos por
 * compasso 4/4. Compassos são separados por "|" e cada um precisa somar 16.
 */

export const STEPS_PER_BAR = 16;

const NOTE_OFFSETS: Readonly<Record<string, number>> = {
  c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
};

const CHORD_QUALITIES: Readonly<Record<string, readonly number[]>> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  "7": [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  sus4: [0, 5, 7],
  "7sus4": [0, 5, 7, 10],
  dim: [0, 3, 6],
};

export interface Chord {
  readonly symbol: string;
  /** Classe de altura da fundamental (0 = dó). */
  readonly root: number;
  /** Classe de altura tocada pelo baixo; difere da fundamental em "C/E". */
  readonly bass: number;
  readonly intervals: readonly number[];
}

export interface MelodyNote {
  readonly step: number;
  readonly midi: number;
  readonly steps: number;
}

export interface ChordChange {
  readonly step: number;
  readonly chord: Chord;
}

/** Resto sempre positivo, para classes de altura de notas graves. */
export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** Converte "c4", "f#5" ou "bb3" em MIDI, com c4 = 60. */
export function parsePitch(token: string): number {
  const match = /^([a-g])([#b]?)(\d)$/.exec(token);
  if (!match) throw new Error(`Nota inválida: "${token}"`);
  const [, letter, accidental, octave] = match;
  const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return (Number(octave) + 1) * 12 + NOTE_OFFSETS[letter] + shift;
}

function parsePitchClass(name: string): number {
  return pitchClass(parsePitch(`${name.toLowerCase()}4`));
}

/** Cifras como "F", "Gm7", "Bbmaj7", "Abm6" ou "C/E". */
export function parseChord(symbol: string): Chord {
  const match = /^([A-G][#b]?)(maj7|m7|m6|7sus4|sus4|dim|m|7|6)?(?:\/([A-G][#b]?))?$/.exec(symbol);
  if (!match) throw new Error(`Cifra inválida: "${symbol}"`);
  const [, rootName, quality = "", bassName] = match;
  const root = parsePitchClass(rootName);
  return {
    symbol,
    root,
    bass: bassName ? parsePitchClass(bassName) : root,
    intervals: CHORD_QUALITIES[quality],
  };
}

/** Classes de altura do acorde, para testes de harmonia e vozes. */
export function chordTones(chord: Chord): Set<number> {
  return new Set(chord.intervals.map((interval) => pitchClass(chord.root + interval)));
}

function splitBars(source: string): string[][] {
  return source
    .split("|")
    .map((bar) => bar.trim().split(/\s+/).filter(Boolean))
    .filter((bar) => bar.length > 0);
}

/**
 * Melodia: "c5:4 e5:2 .:2 g5:8 | ..." — nota ou pausa ("."), com duração
 * opcional em semicolcheias depois de ":" (padrão 1).
 */
export function parseMelody(source: string): { notes: MelodyNote[]; bars: number } {
  const notes: MelodyNote[] = [];
  const bars = splitBars(source);
  bars.forEach((tokens, bar) => {
    let step = bar * STEPS_PER_BAR;
    for (const token of tokens) {
      const [pitch, length = "1"] = token.split(":");
      const steps = Number(length);
      if (!Number.isInteger(steps) || steps < 1) {
        throw new Error(`Duração inválida em "${token}"`);
      }
      if (pitch !== ".") notes.push({ step, midi: parsePitch(pitch), steps });
      step += steps;
    }
    const total = step - bar * STEPS_PER_BAR;
    if (total !== STEPS_PER_BAR) {
      throw new Error(`Compasso ${bar + 1} da melodia soma ${total} passos: "${tokens.join(" ")}"`);
    }
  });
  return { notes, bars: bars.length };
}

/** Progressão: um, dois ou quatro acordes por compasso, divididos por igual. */
export function parseChords(source: string): { changes: ChordChange[]; bars: number } {
  const changes: ChordChange[] = [];
  const bars = splitBars(source);
  bars.forEach((symbols, bar) => {
    if (![1, 2, 4].includes(symbols.length)) {
      throw new Error(`Compasso ${bar + 1} precisa de 1, 2 ou 4 acordes: "${symbols.join(" ")}"`);
    }
    const span = STEPS_PER_BAR / symbols.length;
    symbols.forEach((symbol, index) => {
      changes.push({ step: bar * STEPS_PER_BAR + index * span, chord: parseChord(symbol) });
    });
  });
  return { changes, bars: bars.length };
}

/** Padrão rítmico de um caractere por passo; precisa fechar compassos inteiros. */
export function parsePattern(source: string): string[] {
  const tokens = splitBars(source).flat();
  if (tokens.length === 0 || tokens.length % STEPS_PER_BAR !== 0) {
    throw new Error(`Padrão precisa de múltiplos de ${STEPS_PER_BAR} passos: "${source}"`);
  }
  return tokens;
}
