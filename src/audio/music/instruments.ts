import { midiToFrequency } from "../synth";
import type { MelodicVoice } from "./types";

/** A note already positioned in audio-context time. */
export interface NoteRequest {
  readonly midi: number;
  readonly when: number;
  readonly duration: number;
  readonly velocity: number;
  readonly destination: AudioNode;
}

interface Envelope {
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
}

/** Additive timbre partial: frequency ratio, level and decay. */
type Partial = readonly [ratio: number, level: number, decay: number];

const STEEL: readonly Partial[] = [[1, 1, 0.42], [2, 0.5, 0.2], [3, 0.2, 0.1]];
const BELL: readonly Partial[] = [[1, 1, 0.75], [2, 0.12, 0.3], [4, 0.28, 0.09]];
const KEYS: readonly Partial[] = [[1, 1, 0.6], [2, 0.32, 0.18], [7, 0.05, 0.02]];

/** Disconnects the note graph when the last source ends. */
function cleanup(source: AudioScheduledSourceNode, nodes: readonly AudioNode[]): void {
  source.onended = () => nodes.forEach((node) => node.disconnect());
}

/** Attack, decay to sustain and release at the end of the note; returns the end. */
function shape(
  gain: AudioParam,
  when: number,
  duration: number,
  peak: number,
  env: Envelope,
): number {
  const off = when + Math.max(duration, env.attack + 0.01);
  gain.setValueAtTime(0, when);
  gain.linearRampToValueAtTime(peak, when + env.attack);
  gain.setTargetAtTime(peak * env.sustain, when + env.attack, env.decay);
  gain.setTargetAtTime(0, off, env.release);
  return off + env.release * 6;
}

/**
 * Synthesized melodic timbres. Each note creates a short graph that
 * disconnects itself; nothing keeps running between notes.
 */
export class Instruments {
  private readonly pulses = new Map<number, PeriodicWave>();

  constructor(private readonly context: BaseAudioContext) {}

  play(voice: MelodicVoice, note: NoteRequest): void {
    switch (voice) {
      case "square": return this.square(note);
      case "brass": return this.brass(note);
      case "reed": return this.reed(note);
      case "steel": return this.additive(note, STEEL, 0.1, 1.6);
      case "bell": return this.additive(note, BELL, 0.085, 2.2);
      case "keys": return this.additive(note, KEYS, 0.085, 1.2);
      case "pluck": return this.pluck(note);
      case "slap": return this.bass(note, "square", 0.4, 2600, 3);
      case "synth": return this.bass(note, "sawtooth", 0.55, 1900, 6);
      case "upright": return this.upright(note);
    }
  }

  /** Pulse wave with `duty` width, the classic arcade lead timbre. */
  private pulse(duty: number): PeriodicWave {
    const cached = this.pulses.get(duty);
    if (cached) return cached;
    const harmonics = 48;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    for (let n = 1; n < harmonics; n++) {
      real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    }
    const wave = this.context.createPeriodicWave(real, imag);
    this.pulses.set(duty, wave);
    return wave;
  }

  /** `type` accepts the native shapes or a pulse width (0–1). */
  private oscillator(type: OscillatorType | number, frequency: number, detune = 0): OscillatorNode {
    const oscillator = this.context.createOscillator();
    if (typeof type === "number") oscillator.setPeriodicWave(this.pulse(type));
    else oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.detune.value = detune;
    return oscillator;
  }

  private filter(type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    return filter;
  }

  private gain(value: number): GainNode {
    const gain = this.context.createGain();
    gain.gain.value = value;
    return gain;
  }

  /** Vibrato that comes in after the attack, only on long notes. */
  private vibrato(
    targets: readonly OscillatorNode[],
    when: number,
    end: number,
    delay: number,
    cents: number,
  ): AudioNode[] {
    const lfo = this.oscillator("sine", 5.6);
    const depth = this.gain(0);
    depth.gain.setValueAtTime(0, when + delay);
    depth.gain.linearRampToValueAtTime(cents, when + delay + 0.25);
    lfo.connect(depth);
    targets.forEach((target) => depth.connect(target.detune));
    lfo.start(when);
    lfo.stop(end);
    return [lfo, depth];
  }

  private finish(
    sources: readonly OscillatorNode[],
    nodes: AudioNode[],
    when: number,
    end: number,
  ): void {
    sources.forEach((source) => {
      source.start(when);
      source.stop(end);
    });
    cleanup(sources[0], [...sources, ...nodes]);
  }

  private square({ midi, when, duration, velocity, destination }: NoteRequest): void {
    const frequency = midiToFrequency(midi);
    const main = this.oscillator(0.25, frequency);
    const layer = this.oscillator("square", frequency, 8);
    const layerGain = this.gain(0.3);
    const tone = this.filter("lowpass", 3600);
    const amp = this.gain(0);
    const end = shape(amp.gain, when, duration, 0.105 * velocity, {
      attack: 0.008, decay: 0.15, sustain: 0.7, release: 0.05,
    });
    main.connect(tone);
    layer.connect(layerGain).connect(tone);
    tone.connect(amp).connect(destination);
    const extra = duration > 0.3 ? this.vibrato([main, layer], when, end, 0.18, 16) : [];
    this.finish([main, layer], [layerGain, tone, amp, ...extra], when, end);
  }

  private brass({ midi, when, duration, velocity, destination }: NoteRequest): void {
    const frequency = midiToFrequency(midi);
    const voices = [-10, 0, 10].map((detune) => this.oscillator("sawtooth", frequency, detune));
    // The filter opens on the attack and settles: that is the "blat" of synthesized brass.
    const tone = this.filter("lowpass", 350, 1.4);
    tone.frequency.setValueAtTime(350, when);
    tone.frequency.linearRampToValueAtTime(400 + 3000 * velocity, when + 0.035);
    tone.frequency.setTargetAtTime(1200 + 700 * velocity, when + 0.035, 0.12);
    const amp = this.gain(0);
    const end = shape(amp.gain, when, duration, 0.075 * velocity, {
      attack: 0.014, decay: 0.2, sustain: 0.75, release: 0.07,
    });
    voices.forEach((voice) => voice.connect(tone));
    tone.connect(amp).connect(destination);
    const extra = duration > 0.35 ? this.vibrato(voices, when, end, 0.22, 12) : [];
    this.finish(voices, [tone, amp, ...extra], when, end);
  }

  private reed({ midi, when, duration, velocity, destination }: NoteRequest): void {
    const frequency = midiToFrequency(midi);
    const main = this.oscillator(0.125, frequency);
    const edge = this.oscillator("sawtooth", frequency, -5);
    const edgeGain = this.gain(0.3);
    // Entry slightly below the note, like a breath.
    main.detune.setValueAtTime(-70, when);
    main.detune.linearRampToValueAtTime(0, when + 0.06);
    const nasal = this.filter("bandpass", 1350, 0.75);
    const amp = this.gain(0);
    const end = shape(amp.gain, when, duration, 0.22 * velocity, {
      attack: 0.022, decay: 0.2, sustain: 0.85, release: 0.06,
    });
    main.connect(nasal);
    edge.connect(edgeGain).connect(nasal);
    nasal.connect(amp).connect(destination);
    const extra = duration > 0.2 ? this.vibrato([main, edge], when, end, 0.1, 22) : [];
    this.finish([main, edge], [edgeGain, nasal, amp, ...extra], when, end);
  }

  /** Steel drum, bell and electric keys: sine partials with their own decays. */
  private additive(
    { midi, when, duration, velocity, destination }: NoteRequest,
    partials: readonly Partial[],
    peak: number,
    maxRing: number,
  ): void {
    const frequency = midiToFrequency(midi);
    const amp = this.gain(1);
    // Cuts the resonance a little after the written end of the note.
    const off = when + Math.min(duration + 0.25, maxRing);
    amp.gain.setTargetAtTime(0, off, 0.05);
    const end = off + 0.3;
    const sources: OscillatorNode[] = [];
    const nodes: AudioNode[] = [amp];
    for (const [ratio, level, decay] of partials) {
      const oscillator = this.oscillator("sine", frequency * ratio);
      const envelope = this.gain(0);
      envelope.gain.setValueAtTime(0, when);
      envelope.gain.linearRampToValueAtTime(peak * level * velocity, when + 0.004);
      envelope.gain.setTargetAtTime(0, when + 0.004, decay);
      oscillator.connect(envelope).connect(amp);
      sources.push(oscillator);
      nodes.push(envelope);
    }
    amp.connect(destination);
    this.finish(sources, nodes, when, end);
  }

  private pluck({ midi, when, duration, velocity, destination }: NoteRequest): void {
    const frequency = midiToFrequency(midi);
    const body = this.oscillator("sawtooth", frequency);
    const round = this.oscillator("triangle", frequency, 4);
    const tone = this.filter("lowpass", 4200, 2);
    tone.frequency.setValueAtTime(4200, when);
    tone.frequency.setTargetAtTime(700, when, 0.07);
    const amp = this.gain(0);
    const end = shape(amp.gain, when, Math.min(duration, 0.35), 0.105 * velocity, {
      attack: 0.003, decay: 0.16, sustain: 0.1, release: 0.04,
    });
    body.connect(tone);
    round.connect(tone);
    tone.connect(amp).connect(destination);
    this.finish([body, round], [tone, amp], when, end);
  }

  /** Electric bass: the filter snaps on the attack; high notes sound like slap. */
  private bass(
    { midi, when, duration, velocity, destination }: NoteRequest,
    edge: OscillatorType,
    edgeLevel: number,
    brightness: number,
    resonance: number,
  ): void {
    const frequency = midiToFrequency(midi);
    const body = this.oscillator("triangle", frequency);
    const top = this.oscillator(edge, frequency);
    const topGain = this.gain(edgeLevel);
    const tone = this.filter("lowpass", 400, resonance);
    tone.frequency.setValueAtTime(350 + brightness * velocity, when);
    tone.frequency.setTargetAtTime(360, when, 0.07);
    const amp = this.gain(0);
    const end = shape(amp.gain, when, duration, 0.17 * velocity, {
      attack: 0.004, decay: 0.22, sustain: 0.5, release: 0.035,
    });
    body.connect(tone);
    top.connect(topGain).connect(tone);
    tone.connect(amp).connect(destination);
    this.finish([body, top], [topGain, tone, amp], when, end);
  }

  private upright({ midi, when, duration, velocity, destination }: NoteRequest): void {
    const frequency = midiToFrequency(midi);
    const body = this.oscillator("sine", frequency);
    const wood = this.oscillator("triangle", frequency);
    const woodGain = this.gain(0.55);
    const tone = this.filter("lowpass", 1100);
    const amp = this.gain(0);
    const end = shape(amp.gain, when, duration, 0.15 * velocity, {
      attack: 0.006, decay: 0.3, sustain: 0.35, release: 0.06,
    });
    body.connect(tone);
    wood.connect(woodGain).connect(tone);
    tone.connect(amp).connect(destination);
    this.finish([body, wood], [woodGain, tone, amp], when, end);
  }
}
