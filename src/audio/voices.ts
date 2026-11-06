import { clamp } from "./synth";

/** Motor do jogador: escapamento tonal com admissão sob aceleração. */
export class PlayerEngine {
  private readonly source: AudioBufferSourceNode;
  private readonly intake: AudioBufferSourceNode;
  private readonly intakeGain: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;

  constructor(
    context: AudioContext,
    destination: AudioNode,
    engineBuffer: AudioBuffer,
    noiseBuffer: AudioBuffer,
  ) {
    this.source = context.createBufferSource();
    this.source.buffer = engineBuffer;
    this.source.loop = true;

    this.filter = context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = 0.6;

    this.gain = context.createGain();
    this.gain.gain.value = 0;

    this.intake = context.createBufferSource();
    this.intake.buffer = noiseBuffer;
    this.intake.loop = true;
    const intakeFilter = context.createBiquadFilter();
    intakeFilter.type = "bandpass";
    intakeFilter.frequency.value = 820;
    intakeFilter.Q.value = 0.8;
    this.intakeGain = context.createGain();
    this.intakeGain.gain.value = 0;

    this.source.connect(this.filter);
    this.filter.connect(this.gain).connect(destination);
    this.intake
      .connect(intakeFilter)
      .connect(this.intakeGain)
      .connect(this.gain);

    const now = context.currentTime;
    this.source.start(now);
    this.intake.start(now);
  }

  update(
    now: number,
    speedRatio: number,
    throttle: number,
    boost: number,
    active: boolean,
  ): void {
    const rate = clamp(
      0.64 + speedRatio * 1.08 + throttle * 0.23 + boost * 0.16,
      0.64,
      2.4,
    );
    const volume = active
      ? 0.045 + throttle * 0.065 + speedRatio * 0.035 + boost * 0.015
      : 0;

    this.source.playbackRate.setTargetAtTime(rate, now, 0.06);
    this.filter.frequency.setTargetAtTime(
      340 + rate * 500 + throttle * 300,
      now,
      0.08,
    );
    this.gain.gain.setTargetAtTime(volume, now, active ? 0.08 : 0.22);
    this.intakeGain.gain.setTargetAtTime(
      active ? throttle * 0.045 : 0,
      now,
      0.09,
    );
  }

  get level(): number {
    return this.gain.gain.value;
  }
}

/** Motor distante de um rival, com pan e atenuação por distância. */
export class RivalEngine {
  private readonly source: AudioBufferSourceNode;
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;
  private readonly panner: StereoPannerNode;

  constructor(
    context: AudioContext,
    destination: AudioNode,
    engineBuffer: AudioBuffer,
  ) {
    this.source = context.createBufferSource();
    this.source.buffer = engineBuffer;
    this.source.loop = true;

    this.filter = context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = 0.9;

    this.gain = context.createGain();
    this.gain.gain.value = 0;

    this.panner = context.createStereoPanner();

    this.source
      .connect(this.filter)
      .connect(this.gain)
      .connect(this.panner)
      .connect(destination);
    this.source.start(context.currentTime);
  }

  update(
    now: number,
    speedRatio: number,
    pan: number,
    proximity: number,
    active: boolean,
  ): void {
    const rate = 0.65 + speedRatio * 1.15;
    this.source.playbackRate.setTargetAtTime(rate, now, 0.1);
    this.filter.frequency.setTargetAtTime(300 + rate * 480, now, 0.1);
    this.panner.pan.setTargetAtTime(clamp(pan, -0.9, 0.9), now, 0.06);
    this.gain.gain.setTargetAtTime(
      active ? proximity * 0.032 : 0,
      now,
      0.1,
    );
  }

  get level(): number {
    return this.gain.gain.value;
  }
}

export interface SkidState {
  speed: number;
  lateral: number;
  drifting: boolean;
  surface: "asphalt" | "dirt" | "grass";
}

/** Hiss, guincho e ronco de piso, todos a partir do mesmo ruído. */
export class SkidNoise {
  private readonly source: AudioBufferSourceNode;
  private readonly hissFilter: BiquadFilterNode;
  private readonly hissGain: GainNode;
  private readonly squealFilter: BiquadFilterNode;
  private readonly squealGain: GainNode;
  private readonly rumbleFilter: BiquadFilterNode;
  private readonly rumbleGain: GainNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly windGain: GainNode;

  constructor(
    context: AudioContext,
    destination: AudioNode,
    noiseBuffer: AudioBuffer,
  ) {
    this.source = context.createBufferSource();
    this.source.buffer = noiseBuffer;
    this.source.loop = true;

    this.hissFilter = context.createBiquadFilter();
    this.hissFilter.type = "bandpass";
    this.hissFilter.Q.value = 0.8;
    this.hissGain = context.createGain();
    this.hissGain.gain.value = 0;

    this.squealFilter = context.createBiquadFilter();
    this.squealFilter.type = "bandpass";
    this.squealFilter.Q.value = 8;
    this.squealGain = context.createGain();
    this.squealGain.gain.value = 0;

    this.rumbleFilter = context.createBiquadFilter();
    this.rumbleFilter.type = "lowpass";
    this.rumbleFilter.Q.value = 0.7;
    this.rumbleGain = context.createGain();
    this.rumbleGain.gain.value = 0;

    this.windFilter = context.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 900;
    this.windFilter.Q.value = 0.45;
    this.windGain = context.createGain();
    this.windGain.gain.value = 0;

    this.source.connect(this.hissFilter).connect(this.hissGain).connect(destination);
    this.source.connect(this.squealFilter).connect(this.squealGain).connect(destination);
    this.source.connect(this.rumbleFilter).connect(this.rumbleGain).connect(destination);
    this.source.connect(this.windFilter).connect(this.windGain).connect(destination);
    this.source.start(context.currentTime);
  }

  update(now: number, state: SkidState, active: boolean): void {
    const speed = clamp(state.speed / 10, 0, 1);
    const slip = clamp((Math.abs(state.lateral) - 1.2) / 7, 0, 1);
    const drift = state.drifting ? 0.34 : 0;
    const intensity = active ? clamp((slip + drift) * speed, 0, 1) : 0;
    const asphalt = state.surface === "asphalt";
    const dirt = state.surface === "dirt";

    const hiss = asphalt ? 0.075 : dirt ? 0.055 : 0.038;
    const squeal = asphalt ? 0.03 : dirt ? 0.012 : 0.008;
    const rumble = asphalt ? 0.006 : dirt ? 0.022 : 0.032;

    this.hissFilter.frequency.setTargetAtTime(
      asphalt ? 2200 : dirt ? 1150 : 820,
      now,
      0.08,
    );
    this.squealFilter.frequency.setTargetAtTime(
      1150 + state.speed * 18 + slip * 260,
      now,
      0.08,
    );
    this.rumbleFilter.frequency.setTargetAtTime(
      asphalt ? 110 : dirt ? 150 : 190,
      now,
      0.08,
    );

    this.hissGain.gain.setTargetAtTime(intensity * hiss, now, 0.08);
    this.squealGain.gain.setTargetAtTime(
      intensity * squeal * (0.55 + slip * 0.45),
      now,
      0.06,
    );
    this.rumbleGain.gain.setTargetAtTime(
      active ? speed * rumble : 0,
      now,
      0.08,
    );
    this.windGain.gain.setTargetAtTime(
      active ? clamp(state.speed / 22, 0, 1) ** 2 * 0.016 : 0,
      now,
      0.12,
    );
  }
}

/** Tom fino que sobe com a carga do drift, bem abaixo dos efeitos. */
export class ChargeTone {
  private readonly oscillator: OscillatorNode;
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;

  constructor(context: AudioContext, destination: AudioNode) {
    this.oscillator = context.createOscillator();
    this.oscillator.type = "triangle";
    this.oscillator.frequency.value = 280;

    this.filter = context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 800;
    this.filter.Q.value = 3;

    this.gain = context.createGain();
    this.gain.gain.value = 0;

    this.oscillator
      .connect(this.filter)
      .connect(this.gain)
      .connect(destination);
    this.oscillator.start(context.currentTime);
  }

  update(
    now: number,
    drifting: boolean,
    charge: number,
    tier: number,
  ): void {
    const amount = clamp(charge, 0, 1);
    this.oscillator.frequency.setTargetAtTime(
      260 + amount * 540 + tier * 90,
      now,
      0.06,
    );
    this.filter.frequency.setTargetAtTime(
      700 + amount * 1800,
      now,
      0.06,
    );
    this.gain.gain.setTargetAtTime(
      drifting ? 0.008 + amount * 0.014 : 0,
      now,
      0.08,
    );
  }
}
