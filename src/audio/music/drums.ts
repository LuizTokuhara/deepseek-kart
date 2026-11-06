import type { DrumVoice } from "./types";

/** Corpo tonal com queda de afinação (bumbo, tons, congas). */
interface ToneLayer {
  readonly kind: "tone";
  readonly type: OscillatorType;
  readonly from: number;
  readonly to: number;
  /** Tempo da queda de afinação. */
  readonly sweep: number;
  readonly decay: number;
  readonly level: number;
  readonly offset?: number;
}

/** Ruído filtrado (caixa, pratos, chocalhos). */
interface NoiseLayer {
  readonly kind: "noise";
  readonly filter: BiquadFilterType;
  readonly frequency: number;
  readonly q?: number;
  readonly attack?: number;
  readonly decay: number;
  readonly level: number;
  readonly offset?: number;
}

type DrumLayer = ToneLayer | NoiseLayer;

const tone = (
  type: OscillatorType, from: number, to: number, sweep: number, decay: number, level: number,
): ToneLayer => ({ kind: "tone", type, from, to, sweep, decay, level });

const noise = (
  filter: BiquadFilterType, frequency: number, decay: number, level: number,
  extra: Partial<Pick<NoiseLayer, "q" | "attack" | "offset">> = {},
): NoiseLayer => ({ kind: "noise", filter, frequency, decay, level, ...extra });

const DRUMS: Readonly<Record<DrumVoice, readonly DrumLayer[]>> = {
  kick: [tone("sine", 155, 46, 0.09, 0.075, 0.55), noise("highpass", 2600, 0.006, 0.08)],
  snare: [tone("triangle", 215, 170, 0.04, 0.05, 0.14), noise("highpass", 1500, 0.055, 0.22)],
  rim: [
    tone("triangle", 840, 780, 0.01, 0.016, 0.12),
    noise("bandpass", 2600, 0.012, 0.3, { q: 3 }),
  ],
  clap: [
    ...[0, 0.011, 0.022].map((offset) => noise("bandpass", 1300, 0.008, 0.2, { q: 1.2, offset })),
    noise("bandpass", 1300, 0.065, 0.2, { q: 1.2, offset: 0.03 }),
  ],
  hat: [noise("highpass", 7600, 0.017, 0.12)],
  openHat: [noise("highpass", 7000, 0.085, 0.09)],
  ride: [
    noise("bandpass", 5600, 0.2, 0.07, { q: 1.1 }),
    tone("sine", 3150, 3100, 0.2, 0.22, 0.012),
  ],
  crash: [noise("highpass", 4200, 0.42, 0.13)],
  tomHigh: [tone("sine", 250, 165, 0.12, 0.11, 0.34)],
  tomLow: [tone("sine", 155, 96, 0.15, 0.15, 0.4)],
  congaHigh: [
    tone("sine", 430, 360, 0.03, 0.055, 0.2),
    noise("bandpass", 2200, 0.006, 0.08, { q: 2 }),
  ],
  congaLow: [tone("sine", 300, 245, 0.04, 0.085, 0.24)],
  shaker: [noise("bandpass", 7000, 0.028, 0.07, { q: 0.8, attack: 0.012 })],
  // Guizo: vários estalos metálicos curtos em sequência.
  sleigh: [0, 0.017, 0.034, 0.055].map((offset, index) =>
    noise("bandpass", 8200, 0.022, 0.11 - index * 0.02, { q: 4, offset }),
  ),
};

/**
 * Bateria sintetizada a partir da tabela acima. O buffer de ruído do jogo
 * serve para caixa, pratos e percussão.
 */
export class DrumKit {
  constructor(
    private readonly context: BaseAudioContext,
    private readonly noiseBuffer: AudioBuffer,
  ) {}

  hit(drum: DrumVoice, when: number, velocity: number, destination: AudioNode): void {
    for (const layer of DRUMS[drum]) {
      const start = when + (layer.offset ?? 0);
      if (layer.kind === "tone") this.tone(start, layer, velocity, destination);
      else this.noise(start, layer, velocity, destination);
    }
  }

  private tone(when: number, layer: ToneLayer, velocity: number, destination: AudioNode): void {
    const oscillator = this.context.createOscillator();
    oscillator.type = layer.type;
    oscillator.frequency.setValueAtTime(layer.from, when);
    oscillator.frequency.exponentialRampToValueAtTime(layer.to, when + layer.sweep);
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(layer.level * velocity, when + 0.002);
    envelope.gain.setTargetAtTime(0, when + 0.002, layer.decay);
    oscillator.connect(envelope).connect(destination);
    oscillator.start(when);
    oscillator.stop(when + 0.002 + layer.decay * 7);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }

  private noise(when: number, layer: NoiseLayer, velocity: number, destination: AudioNode): void {
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = layer.filter;
    filter.frequency.value = layer.frequency;
    filter.Q.value = layer.q ?? 0.7;
    const attack = layer.attack ?? 0.001;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(layer.level * velocity, when + attack);
    envelope.gain.setTargetAtTime(0, when + attack, layer.decay);
    source.connect(filter).connect(envelope).connect(destination);
    source.start(when, Math.random() * Math.max(0, this.noiseBuffer.duration - 0.1));
    source.stop(when + attack + layer.decay * 7);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }
}
