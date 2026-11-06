import { midiToFrequency } from "./synth";

const STEPS_PER_BAR = 16;
const BARS = 8;
const TOTAL_STEPS = STEPS_PER_BAR * BARS;
const RACE_STEP_SECONDS = 60 / 132 / 4;
const FINAL_STEP_SECONDS = 60 / 165 / 4;
const RACE_MUSIC_GAIN = 0.74;

interface Chord {
  readonly root: number;
  readonly notes: readonly [number, number, number];
}

// I–vi–IV–V, I–iii–IV–V: dois ciclos para o loop não cansar rápido.
const CHORDS: readonly Chord[] = [
  { root: 36, notes: [60, 64, 67] },
  { root: 33, notes: [57, 60, 64] },
  { root: 41, notes: [65, 69, 72] },
  { root: 43, notes: [67, 71, 74] },
  { root: 36, notes: [60, 64, 67] },
  { root: 40, notes: [64, 67, 71] },
  { root: 41, notes: [65, 69, 72] },
  { root: 43, notes: [67, 71, 74] },
];

const BASS_A = [0, 0, 7, 0, 12, 0, 7, 0] as const;
const BASS_B = [0, 7, 0, 12, 0, 7, 12, 7] as const;

/** Loop tropical de arcade: baixo, acordes, bateria e camada de volta final. */
export class MusicLoop {
  private readonly output: GainNode;
  private readonly volume: GainNode;
  private playing = false;
  private ducked = false;
  private stepSeconds = RACE_STEP_SECONDS;
  private step = 0;
  private nextStep = 0;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
    private readonly noise: AudioBuffer,
  ) {
    this.output = context.createGain();
    this.output.gain.value = 0;
    this.volume = context.createGain();
    this.volume.gain.value = RACE_MUSIC_GAIN;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 5200;
    filter.Q.value = 0.4;
    this.output.connect(this.volume).connect(filter).connect(destination);
  }

  start(delay = 0): void {
    const now = this.context.currentTime;
    this.playing = true;
    this.step = 0;
    this.stepSeconds = RACE_STEP_SECONDS;
    this.nextStep = now + Math.max(0.02, delay);
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setTargetAtTime(1, now, 0.02);
  }

  stop(): void {
    const now = this.context.currentTime;
    this.playing = false;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setTargetAtTime(0, now, 0.025);
  }

  setDucked(ducked: boolean): void {
    if (this.ducked === ducked) return;
    this.ducked = ducked;
    this.volume.gain.setTargetAtTime(
      ducked ? 0.2 : RACE_MUSIC_GAIN,
      this.context.currentTime,
      0.25,
    );
  }

  beginFinalLap(jingleSeconds: number): boolean {
    if (!this.playing || this.stepSeconds === FINAL_STEP_SECONDS) return false;
    const now = this.context.currentTime;
    this.stepSeconds = FINAL_STEP_SECONDS;
    // Retoma do próximo passo da música depois de abrir espaço para a vinheta.
    this.nextStep = Math.max(this.nextStep, now + jingleSeconds);
    this.output.gain.setTargetAtTime(0, now, 0.025);
    this.output.gain.setTargetAtTime(1, this.nextStep - 0.045, 0.01);
    return true;
  }

  update(): void {
    if (!this.playing) return;
    const now = this.context.currentTime;
    // Ao voltar de uma aba suspensa, não tente recuperar o tempo perdido.
    if (this.nextStep < now - 0.05) {
      this.nextStep = now + 0.03;
    }
    const horizon = now + 0.22;
    let guard = 0;
    while (this.nextStep < horizon && guard++ < 8) {
      this.scheduleStep(this.step, this.nextStep);
      this.nextStep += this.stepSeconds;
      this.step = (this.step + 1) % TOTAL_STEPS;
    }
  }

  get debugStep(): number {
    return this.step;
  }

  private scheduleStep(step: number, when: number): void {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const local = step % STEPS_PER_BAR;
    const chord = CHORDS[bar];
    const bassPattern = bar >= BARS / 2 ? BASS_B : BASS_A;

    if (local % 2 === 0) {
      const note = chord.root + bassPattern[local / 2];
      this.bass(midiToFrequency(note), when, this.stepSeconds * 1.7, 0.085);
    }

    if (local === 2 || local === 6 || local === 10 || local === 14) {
      chord.notes.forEach((note, index) => {
        this.pluck(
          midiToFrequency(note + 12),
          when + index * 0.012,
          0.19,
          0.023,
        );
      });
    }

    if (local === 0 || local === 8) {
      this.kick(when, local === 0 ? 0.105 : 0.085);
    }
    if (local === 4 || local === 12 || (bar === BARS - 1 && local >= 13)) {
      this.snare(when);
    }
    if (local % 2 === 1) {
      this.hat(when, local === 7 || local === 15 ? 0.012 : 0.007);
    }
    if (local === 0) {
      this.hat(when, 0.011, 0.09);
    }

    if (this.stepSeconds === FINAL_STEP_SECONDS && local % 4 === 0) {
      const note = chord.notes[(local / 4) % chord.notes.length] + 12;
      this.lead(midiToFrequency(note), when, 0.16, 0.017);
    }
  }

  private bass(frequency: number, when: number, duration: number, gain: number): void {
    const oscillator = this.context.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, when);
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 280;
    filter.Q.value = 1.2;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(gain, when + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(filter).connect(envelope).connect(this.output);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }

  private pluck(frequency: number, when: number, duration: number, gain: number): void {
    const oscillator = this.context.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, when);
    const overtone = this.context.createOscillator();
    overtone.type = "sine";
    overtone.frequency.setValueAtTime(frequency * 2, when);
    const overtoneGain = this.context.createGain();
    overtoneGain.gain.value = 0.32;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 4200;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(gain, when + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(envelope);
    overtone.connect(overtoneGain).connect(envelope);
    envelope.connect(filter).connect(this.output);
    oscillator.start(when);
    overtone.start(when);
    oscillator.stop(when + duration + 0.02);
    overtone.stop(when + duration + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      overtone.disconnect();
      overtoneGain.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }

  private kick(when: number, gain: number): void {
    const oscillator = this.context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(120, when);
    oscillator.frequency.exponentialRampToValueAtTime(44, when + 0.12);
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(gain, when + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    oscillator.connect(envelope).connect(this.output);
    oscillator.start(when);
    oscillator.stop(when + 0.18);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }

  private snare(when: number): void {
    const noise = this.context.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1900;
    filter.Q.value = 0.7;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(0.032, when + 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.1);
    noise.connect(filter).connect(envelope).connect(this.output);
    noise.start(when, Math.random() * 1.2);
    noise.stop(when + 0.12);
    noise.onended = () => {
      noise.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }

  private hat(when: number, gain: number, duration = 0.035): void {
    const noise = this.context.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7200;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(gain, when + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    noise.connect(filter).connect(envelope).connect(this.output);
    noise.start(when, Math.random() * 1.5);
    noise.stop(when + duration + 0.01);
    noise.onended = () => {
      noise.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }

  private lead(frequency: number, when: number, duration: number, gain: number): void {
    const oscillator = this.context.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, when);
    oscillator.frequency.linearRampToValueAtTime(frequency * 1.002, when + duration);
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(gain, when + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(envelope).connect(this.output);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }
}
