import { DrumKit } from "./drums";
import { Instruments } from "./instruments";
import type { CompiledSong, MusicLayer } from "./types";

type Bus = MusicLayer | "drums";

/** Song level measured to sit ~2 dB above the old one, without covering engine and effects. */
const RACE_MUSIC_GAIN = 0.13;
/** Fraction of the volume kept on the results screen. */
const DUCK_RATIO = 0.27;
const LOOKAHEAD_SECONDS = 0.22;
/**
 * Level and stereo position of each layer. The timbres already come out
 * balanced against each other; here the melody sits in front and the accompaniment ~7 dB behind it.
 */
const MIX: Readonly<Record<Bus, { readonly gain: number; readonly pan: number }>> = {
  lead: { gain: 1.78, pan: 0 },
  harmony: { gain: 0.8, pan: -0.22 },
  comp: { gain: 1, pan: 0.2 },
  bass: { gain: 0.8, pan: 0 },
  drums: { gain: 0.85, pan: 0 },
};
/** Fraction of the written duration that each layer holds, to articulate repeats. */
const ARTICULATION: Readonly<Record<MusicLayer, number>> = {
  lead: 0.92, harmony: 0.92, comp: 0.85, bass: 0.9,
};
const ECHO_STEPS = 3;
const ECHO_SEND = 0.2;
const ECHO_FEEDBACK = 0.3;

interface Mix {
  readonly output: GainNode;
  readonly buses: Readonly<Record<Bus, GainNode>>;
  readonly nodes: readonly AudioNode[];
}

/**
 * Song sequencer: schedules a compiled theme with a short lookahead,
 * repeats from the end of the intro and speeds up on the final lap.
 */
export class MusicLoop {
  private readonly volume: GainNode;
  private readonly instruments: Instruments;
  private readonly drums: DrumKit;
  private mix: Mix;
  private retired: { mix: Mix; at: number } | null = null;
  private playing = false;
  private ducked = false;
  private finalLap = false;
  private stepSeconds: number;
  private step = 0;
  private nextStep = 0;

  constructor(
    private readonly context: BaseAudioContext,
    destination: AudioNode,
    noise: AudioBuffer,
    private readonly song: CompiledSong,
  ) {
    this.volume = context.createGain();
    this.volume.gain.value = RACE_MUSIC_GAIN;
    const air = context.createBiquadFilter();
    air.type = "lowpass";
    air.frequency.value = 11000;
    this.volume.connect(air).connect(destination);
    this.instruments = new Instruments(context);
    this.drums = new DrumKit(context, noise);
    this.stepSeconds = song.stepSeconds;
    this.mix = this.createMix();
  }

  start(delay = 0): void {
    const now = this.context.currentTime;
    this.playing = true;
    this.finalLap = false;
    this.step = 0;
    this.stepSeconds = this.song.stepSeconds;
    this.nextStep = now + Math.max(0.02, delay);
    this.replaceMix(now, this.nextStep);
  }

  stop(): void {
    const now = this.context.currentTime;
    this.playing = false;
    this.mix.output.gain.cancelScheduledValues(now);
    this.mix.output.gain.setTargetAtTime(0, now, 0.025);
  }

  setDucked(ducked: boolean): void {
    if (this.ducked === ducked) return;
    this.ducked = ducked;
    this.volume.gain.setTargetAtTime(
      ducked ? RACE_MUSIC_GAIN * DUCK_RATIO : RACE_MUSIC_GAIN,
      this.context.currentTime,
      0.25,
    );
  }

  /** Makes room for the jingle and restarts the main theme faster. */
  beginFinalLap(jingleSeconds: number): boolean {
    if (!this.playing || this.finalLap) return false;
    const now = this.context.currentTime;
    this.finalLap = true;
    this.stepSeconds = this.song.stepSeconds / this.song.finalLapTempo;
    this.step = this.song.loopStart;
    this.nextStep = Math.max(this.nextStep, now + jingleSeconds);
    this.replaceMix(now, this.nextStep);
    return true;
  }

  update(): void {
    if (this.retired && this.context.currentTime > this.retired.at) {
      this.retired.mix.nodes.forEach((node) => node.disconnect());
      this.retired = null;
    }
    if (!this.playing) return;
    const now = this.context.currentTime;
    // When returning from a suspended tab, do not try to catch up on lost time.
    if (this.nextStep < now - 0.05) {
      this.nextStep = now + 0.03;
    }
    this.scheduleUntil(now + LOOKAHEAD_SECONDS);
  }

  /** Schedules all steps that start before `time`; public for offline rendering. */
  scheduleUntil(time: number): void {
    if (!this.playing) return;
    while (this.nextStep < time) {
      this.scheduleStep(this.step, this.nextStep);
      this.nextStep += this.stepSeconds;
      this.step = this.step + 1 < this.song.steps.length ? this.step + 1 : this.song.loopStart;
    }
  }

  get debugStep(): number {
    return this.step;
  }

  private scheduleStep(index: number, when: number): void {
    const step = this.song.steps[index];
    // Swing delays the offbeat eighth note of each beat.
    const time = when + (index % 4 === 2 ? this.song.swing * this.stepSeconds : 0);
    for (const note of step.notes) {
      this.instruments.play(note.voice, {
        midi: note.midi,
        when: time,
        duration: note.steps * this.stepSeconds * ARTICULATION[note.layer],
        velocity: note.velocity,
        destination: this.mix.buses[note.layer],
      });
    }
    for (const hit of step.hits) {
      this.drums.hit(hit.drum, time, hit.velocity, this.mix.buses.drums);
    }
  }

  /**
   * Already-scheduled notes stay in the old mix, which fades out; the new one
   * comes in at `fadeIn`. This way no tail from the previous section leaks into the next.
   */
  private replaceMix(now: number, fadeIn: number): void {
    if (this.retired) this.retired.mix.nodes.forEach((node) => node.disconnect());
    const old = this.mix;
    old.output.gain.cancelScheduledValues(now);
    old.output.gain.setTargetAtTime(0, now, 0.025);
    this.retired = { mix: old, at: now + 3 };
    this.mix = this.createMix();
    this.mix.output.gain.setValueAtTime(0, now);
    this.mix.output.gain.setTargetAtTime(1, Math.max(now, fadeIn - 0.04), 0.01);
  }

  private createMix(): Mix {
    const context = this.context;
    const output = context.createGain();
    output.gain.value = 0;
    output.connect(this.volume);
    const nodes: AudioNode[] = [output];
    const bus = (name: Bus): GainNode => {
      const gain = context.createGain();
      gain.gain.value = MIX[name].gain;
      const pan = context.createStereoPanner();
      pan.pan.value = MIX[name].pan;
      gain.connect(pan).connect(output);
      nodes.push(gain, pan);
      return gain;
    };
    const buses = {
      lead: bus("lead"),
      harmony: bus("harmony"),
      comp: bus("comp"),
      bass: bus("bass"),
      drums: bus("drums"),
    };

    // Dotted-eighth echo on the lead only: arcade space without cluttering the base.
    const send = context.createGain();
    send.gain.value = ECHO_SEND;
    const delay = context.createDelay(1);
    delay.delayTime.value = ECHO_STEPS * this.stepSeconds;
    const feedback = context.createGain();
    feedback.gain.value = ECHO_FEEDBACK;
    const damp = context.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2800;
    buses.lead.connect(send).connect(delay).connect(damp).connect(output);
    damp.connect(feedback).connect(delay);
    nodes.push(send, delay, feedback, damp);

    return { output, buses, nodes };
  }
}
