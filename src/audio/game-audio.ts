import { PHYSICS } from "../core/config";
import type { ItemType, Surface } from "../core/types";
import { MusicLoop, compileSong, type CompiledSong, type SongDefinition } from "./music";
import {
  clamp,
  createEngineBuffer,
  createNoiseBuffer,
  createReverbImpulse,
  midiToFrequency,
} from "./synth";
import { ChargeTone, PlayerEngine, RivalEngine, SkidNoise } from "./voices";

const SOUND_STORAGE_KEY = "deepseek-kart.sound";
const MASTER_VOLUME = 1;
const RIVAL_COUNT = 4;
const FINAL_LAP_JINGLE_SECONDS = 0.58;

export interface AudioRivalFrame {
  x: number;
  z: number;
  speed: number;
}

export interface AudioFrame {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  throttle: number;
  brake: number;
  drifting: boolean;
  driftCharge: number;
  driftTier: number;
  lateral: number;
  surface: Surface;
  grounded: boolean;
  boostTimer: number;
  boostTier: number;
  rivals: readonly AudioRivalFrame[];
}

type ToneOptions = {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  pan?: number;
  filter?: number;
  filterType?: BiquadFilterType;
  when?: number;
  slideTo?: number;
};

type NoiseOptions = {
  gain?: number;
  attack?: number;
  pan?: number;
  filter?: BiquadFilterType;
  frequency?: number;
  frequencyTo?: number;
  q?: number;
  when?: number;
};

function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(SOUND_STORAGE_KEY) === "off";
  } catch {
    return false;
  }
}

function storeMuted(muted: boolean): void {
  try {
    globalThis.localStorage?.setItem(SOUND_STORAGE_KEY, muted ? "off" : "on");
  } catch {
    // Preferência é opcional; o jogo continua sem armazenamento local.
  }
}

/**
 * Áudio 100% procedural: motor, pneus, piso, itens, HUD, torcida e música.
 * O contexto só nasce no primeiro gesto do jogador, como exigem os browsers.
 */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private sfxBus: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private musicBus: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private engineBuffer: AudioBuffer | null = null;
  private music: MusicLoop | null = null;
  private engine: PlayerEngine | null = null;
  private rivals: RivalEngine[] = [];
  private skid: SkidNoise | null = null;
  private charge: ChargeTone | null = null;

  private muted = readMuted();
  private started = false;
  private raceActive = false;
  private wrongWay = false;
  private wrongWayTimer = 0;
  private lastBoostTimer = 0;
  private lastGrounded = true;
  private lastDriftTier = 0;
  private listener = { x: 0, z: 0, yaw: 0 };

  private readonly song: CompiledSong;

  /** `song` é o tema da pista; compilado já aqui para erros de notação aparecerem cedo. */
  constructor(
    song: SongDefinition,
    private readonly onMuteChange?: (muted: boolean) => void,
  ) {
    this.song = compileSong(song);
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.onKeyDown);
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
    this.syncMuteUi();
  }

  get soundMuted(): boolean {
    return this.muted;
  }

  /** Primeiro gesto: cria/retoma o contexto e prepara o grid. */
  startRace(): void {
    const context = this.ensureContext();
    if (!context) return;
    void context.resume().catch(() => undefined);
    this.started = true;
    this.raceActive = true;
    this.resetRound();
    this.playIgnition();
  }

  /** Reinicia a rodada sem matar o contexto nem a preferência de som. */
  resetRound(): void {
    this.raceActive = true;
    this.wrongWay = false;
    this.wrongWayTimer = 0;
    this.lastBoostTimer = 0;
    this.lastGrounded = true;
    this.lastDriftTier = 0;
    this.music?.stop();
    this.music?.setDucked(false);
  }

  update(frameDt: number, frame: AudioFrame): void {
    this.listener.x = frame.x;
    this.listener.z = frame.z;
    this.listener.yaw = frame.yaw;
    if (!this.started || !this.context) return;

    const now = this.context.currentTime;
    const speedRatio = clamp(Math.abs(frame.speed) / PHYSICS.topSpeed, 0, 1.35);
    const boost = frame.boostTimer > 0 ? 1 : 0;

    this.engine?.update(
      now,
      speedRatio,
      frame.throttle,
      boost,
      this.raceActive,
    );
    this.updateRivals(now, frame);
    this.skid?.update(
      now,
      {
        speed: Math.abs(frame.speed),
        lateral: frame.lateral,
        drifting: frame.drifting,
        surface: frame.surface,
      },
      this.raceActive,
    );
    this.charge?.update(
      now,
      this.raceActive && frame.drifting,
      frame.driftCharge,
      frame.driftTier,
    );

    if (frame.boostTimer > 0 && this.lastBoostTimer <= 0) {
      this.playBoost(frame.boostTier);
    }
    if (this.lastGrounded && !frame.grounded && Math.abs(frame.speed) > 1) {
      this.playHop();
    } else if (!this.lastGrounded && frame.grounded) {
      this.playLanding();
    }
    if (
      frame.drifting &&
      frame.driftTier > this.lastDriftTier &&
      frame.driftTier > 0
    ) {
      this.playDriftTier(frame.driftTier);
    } else if (
      this.lastDriftTier > 0 &&
      !frame.drifting &&
      frame.boostTimer <= 0
    ) {
      this.playTireChirp();
    }

    if (this.wrongWay && this.raceActive) {
      this.wrongWayTimer -= frameDt;
      if (this.wrongWayTimer <= 0) {
        this.wrongWayTimer = 0.95;
        this.playWrongWay();
      }
    }

    this.music?.update();

    this.lastBoostTimer = frame.boostTimer;
    this.lastGrounded = frame.grounded;
    this.lastDriftTier = frame.drifting ? frame.driftTier : 0;
  }

  countdown(label: string | null): void {
    if (!this.context || !label) return;
    if (label === "GO!") {
      this.playGo();
      this.playCrowd(0.075);
      this.music?.start(0.2);
      return;
    }
    const number = Number(label);
    if (Number.isFinite(number)) {
      this.playCountdown(number);
    }
  }

  lap(lap: number, totalLaps: number): void {
    if (lap < totalLaps) {
      this.playLap();
    } else if (this.music?.beginFinalLap(FINAL_LAP_JINGLE_SECONDS)) {
      this.playFinalLap();
    }
  }

  finishRace(won: boolean): void {
    this.raceActive = false;
    this.wrongWay = false;
    this.music?.setDucked(true);
    this.playFinish(won);
  }

  raceOver(): void {
    this.raceActive = false;
    this.wrongWay = false;
    this.music?.setDucked(true);
    this.playRaceOver();
  }

  pickup(
    item: ItemType,
    count: number,
    x: number,
    z: number,
    isPlayer: boolean,
  ): void {
    const spot = this.position(x, z, isPlayer);
    if (spot.gain < 0.05) return;
    const root = item === "oil-can" ? 79 : item === "lightning" ? 84 : 81;
    const notes = count > 1 ? [0, 4, 7, 12] : [0, 4, 7];
    notes.forEach((semitones, index) => {
      this.tone(midiToFrequency(root + semitones), 0.18, {
        type: "triangle",
        gain: 0.055 * spot.gain,
        pan: spot.pan,
        when: index * 0.055,
        filter: 4800,
      });
    });
    this.noiseBurst(0.08, {
      filter: "highpass",
      frequency: 5200,
      gain: 0.018 * spot.gain,
      pan: spot.pan,
    });
  }

  useItem(
    item: ItemType,
    x: number,
    z: number,
    isPlayer: boolean,
  ): void {
    const spot = this.position(x, z, isPlayer);
    if (spot.gain < 0.05) return;
    const gain = spot.gain;
    const pan = spot.pan;

    if (item === "missile" || item === "red-missile") {
      const red = item === "red-missile";
      this.tone(red ? 760 : 980, 0.2, {
        type: "sawtooth",
        gain: 0.08 * gain,
        pan,
        slideTo: red ? 190 : 230,
        filter: 2200,
      });
      this.noiseBurst(0.22, {
        filter: "bandpass",
        frequency: red ? 1100 : 1500,
        frequencyTo: 300,
        q: 0.8,
        gain: 0.085 * gain,
        pan,
      });
    } else if (item === "oil-can") {
      // Metal can clattering onto the asphalt before the low glug of the spill.
      this.tone(460, 0.12, {
        type: "square",
        gain: 0.04 * gain,
        pan,
        slideTo: 210,
        filter: 2600,
      });
      this.tone(210, 0.22, {
        type: "sine",
        gain: 0.09 * gain,
        pan,
        slideTo: 75,
        when: 0.04,
      });
      this.noiseBurst(0.14, {
        filter: "lowpass",
        frequency: 850,
        frequencyTo: 320,
        gain: 0.045 * gain,
        pan,
      });
    } else {
      this.tone(220, 0.3, {
        type: "triangle",
        gain: 0.065 * gain,
        pan,
        slideTo: 920,
        filter: 3200,
      });
      this.noiseBurst(0.32, {
        filter: "bandpass",
        frequency: 700,
        frequencyTo: 2800,
        q: 0.7,
        gain: 0.055 * gain,
        pan,
      });
    }
  }

  hit(item: ItemType, x: number, z: number, isPlayer: boolean): void {
    const spot = this.position(x, z, isPlayer);
    if (spot.gain < 0.05) return;
    const gain = spot.gain;
    const pan = spot.pan;

    if (item === "oil-can") {
      this.tone(330, 0.22, {
        type: "triangle",
        gain: 0.11 * gain,
        pan,
        slideTo: 100,
      });
      this.noiseBurst(0.18, {
        filter: "lowpass",
        frequency: 700,
        frequencyTo: 240,
        gain: 0.06 * gain,
        pan,
      });
    } else {
      this.tone(190, 0.22, {
        type: "sine",
        gain: 0.16 * gain,
        pan,
        slideTo: 52,
      });
      this.noiseBurst(0.18, {
        filter: "bandpass",
        frequency: 1300,
        q: 0.7,
        gain: 0.11 * gain,
        pan,
      });
      this.noiseBurst(0.035, {
        filter: "highpass",
        frequency: 3400,
        gain: 0.04 * gain,
        pan,
      });
    }

    if (isPlayer) {
      this.tone(1100, 0.55, {
        type: "triangle",
        gain: 0.032,
        slideTo: 260,
        filter: 2600,
      });
    }
  }

  impact(strength: number): void {
    const amount = clamp(strength / 15, 0, 1);
    this.tone(155, 0.18, {
      type: "sine",
      gain: 0.06 + amount * 0.09,
      slideTo: 48,
    });
    this.noiseBurst(0.14, {
      filter: "lowpass",
      frequency: 700,
      gain: 0.04 + amount * 0.06,
    });
    this.noiseBurst(0.03, {
      filter: "highpass",
      frequency: 2600,
      gain: 0.02 + amount * 0.025,
    });
  }

  setWrongWay(active: boolean): void {
    if (active && !this.wrongWay) {
      this.wrongWayTimer = 0;
    }
    this.wrongWay = active;
    if (!active) this.wrongWayTimer = 0;
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    storeMuted(this.muted);
    this.applyMasterGain();
    if (!this.muted) {
      const context = this.ensureContext();
      if (context) {
        void context.resume().catch(() => undefined);
        this.playMuteConfirm();
      }
    }
    this.syncMuteUi();
    this.onMuteChange?.(this.muted);
    return this.muted;
  }

  /** Níveis para depuração no navegador; não faz parte da lógica do jogo. */
  debugState(): {
    context: string;
    muted: boolean;
    rms: number;
    peak: number;
    engine: number;
    musicStep: number;
  } {
    let rms = 0;
    let peak = 0;
    if (this.analyser) {
      const data = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        sum += value * value;
        peak = Math.max(peak, Math.abs(value));
      }
      rms = Math.sqrt(sum / data.length);
    }
    return {
      context: this.context?.state ?? "none",
      muted: this.muted,
      rms,
      peak,
      engine: this.engine?.level ?? 0,
      musicStep: this.music?.debugStep ?? 0,
    };
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === "undefined") return null;
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return null;

    let context: AudioContext;
    try {
      context = new AudioCtor({ latencyHint: "interactive" });
    } catch {
      return null;
    }

    const master = context.createGain();
    master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    master.connect(compressor).connect(analyser).connect(context.destination);

    const sfxBus = context.createGain();
    sfxBus.gain.value = 1.15;
    sfxBus.connect(master);
    const engineBus = context.createGain();
    engineBus.gain.value = 1;
    engineBus.connect(master);
    const musicBus = context.createGain();
    musicBus.gain.value = 0.95;
    musicBus.connect(master);

    // Send curto de ambiente: dá cauda a itens, torcida e música, sem sujar o motor.
    const reverb = context.createConvolver();
    reverb.buffer = createReverbImpulse(context);
    const reverbGain = context.createGain();
    reverbGain.gain.value = 0.12;
    reverb.connect(reverbGain).connect(master);
    const reverbFilter = context.createBiquadFilter();
    reverbFilter.type = "highpass";
    reverbFilter.frequency.value = 260;
    reverbFilter.connect(reverb);
    const sfxReverb = context.createGain();
    sfxReverb.gain.value = 0.18;
    sfxBus.connect(sfxReverb).connect(reverbFilter);
    const musicReverb = context.createGain();
    musicReverb.gain.value = 0.11;
    musicBus.connect(musicReverb).connect(reverbFilter);

    this.context = context;
    this.master = master;
    this.analyser = analyser;
    this.sfxBus = sfxBus;
    this.engineBus = engineBus;
    this.musicBus = musicBus;
    this.noiseBuffer = createNoiseBuffer(context);
    this.engineBuffer = createEngineBuffer(context);

    this.engine = new PlayerEngine(
      context,
      engineBus,
      this.engineBuffer,
      this.noiseBuffer,
    );
    this.rivals = Array.from(
      { length: RIVAL_COUNT },
      () => new RivalEngine(context, engineBus, this.engineBuffer!),
    );
    this.skid = new SkidNoise(context, sfxBus, this.noiseBuffer);
    this.charge = new ChargeTone(context, sfxBus);
    this.music = new MusicLoop(context, musicBus, this.noiseBuffer, this.song);
    this.syncMuteUi();
    return context;
  }

  private applyMasterGain(): void {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(
      this.muted ? 0 : MASTER_VOLUME,
      this.context.currentTime,
      0.02,
    );
  }

  private updateRivals(now: number, frame: AudioFrame): void {
    const rightX = -Math.cos(frame.yaw);
    const rightZ = Math.sin(frame.yaw);
    this.rivals.forEach((voice, index) => {
      const rival = frame.rivals[index];
      if (!rival) {
        voice.update(now, 0, 0, 0, false);
        return;
      }
      const dx = rival.x - frame.x;
      const dz = rival.z - frame.z;
      const distance = Math.hypot(dx, dz);
      const pan = clamp((dx * rightX + dz * rightZ) / 12, -0.9, 0.9);
      const proximity =
        clamp(1 - distance / 32, 0, 1) ** 1.5 *
        clamp(Math.abs(rival.speed) / PHYSICS.topSpeed + 0.2, 0, 1.2);
      voice.update(
        now,
        clamp(Math.abs(rival.speed) / PHYSICS.topSpeed, 0, 1.3),
        pan,
        proximity,
        this.raceActive && distance < 34,
      );
    });
  }

  private playCountdown(number: number): void {
    const frequency = 620 + (3 - number) * 130;
    this.tone(frequency, 0.14, {
      type: "square",
      gain: 0.11,
      filter: 2800,
      attack: 0.003,
    });
    this.noiseBurst(0.025, {
      filter: "highpass",
      frequency: 3600,
      gain: 0.03,
      attack: 0.001,
    });
  }

  private playGo(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      this.tone(frequency, 0.62, {
        type: index % 2 === 0 ? "triangle" : "sawtooth",
        gain: 0.055,
        when: index * 0.012,
        filter: 4200,
        attack: 0.005,
      });
    });
    this.tone(105, 0.28, {
      type: "sine",
      gain: 0.09,
      slideTo: 48,
    });
  }

  private playIgnition(): void {
    this.tone(62, 0.3, {
      type: "sawtooth",
      gain: 0.035,
      slideTo: 96,
      filter: 700,
    });
    this.noiseBurst(0.22, {
      filter: "lowpass",
      frequency: 520,
      gain: 0.045,
      attack: 0.015,
    });
  }

  private playLap(): void {
    [79, 84].forEach((note, index) => {
      this.tone(midiToFrequency(note), 0.22, {
        type: "triangle",
        gain: 0.045,
        when: index * 0.09,
        filter: 4600,
      });
    });
  }

  private playFinalLap(): void {
    [67, 71, 74].forEach((note, index) => {
      this.tone(midiToFrequency(note), 0.14, {
        type: "square",
        gain: 0.085,
        when: index * 0.09,
        filter: 3100,
      });
    });
    [67, 71, 74, 79].forEach((note) => {
      this.tone(midiToFrequency(note), FINAL_LAP_JINGLE_SECONDS - 0.29, {
        type: "sawtooth",
        gain: note === 79 ? 0.11 : 0.045,
        when: 0.29,
        filter: 3400,
      });
    });
    this.playCrowd(0.035, 0.29);
  }

  private playFinish(won: boolean): void {
    const notes = won ? [72, 76, 79, 84] : [72, 76, 79];
    notes.forEach((note, index) => {
      this.tone(midiToFrequency(note), won ? 0.42 : 0.5, {
        type: "triangle",
        gain: won ? 0.075 : 0.055,
        when: index * 0.13,
        filter: 4600,
      });
    });
    if (won) {
      [72, 76, 79, 84].forEach((note) => {
        this.tone(midiToFrequency(note), 1.25, {
          type: "triangle",
          gain: 0.035,
          when: 0.62,
          filter: 4000,
        });
      });
      this.tone(98, 0.4, {
        type: "sine",
        gain: 0.08,
        when: 0.55,
        slideTo: 48,
      });
      this.playCrowd(0.13, 0.1);
    } else {
      this.playCrowd(0.07);
    }
  }

  private playRaceOver(): void {
    [55, 50].forEach((note, index) => {
      this.tone(midiToFrequency(note), 0.5, {
        type: "triangle",
        gain: 0.05,
        when: index * 0.18,
        filter: 2200,
      });
    });
    this.playCrowd(0.045);
  }

  private playBoost(tier: number): void {
    const level = clamp(tier, 1, 3);
    this.noiseBurst(0.4, {
      filter: "bandpass",
      frequency: 850,
      frequencyTo: 3400,
      q: 0.7,
      gain: 0.085,
      attack: 0.01,
    });
    this.tone(150 + level * 30, 0.36, {
      type: "sawtooth",
      gain: 0.045,
      slideTo: 420 + level * 90,
      filter: 3200,
    });
    this.tone(88, 0.24, {
      type: "sine",
      gain: 0.065,
      slideTo: 44,
    });
  }

  private playHop(): void {
    this.tone(210, 0.13, {
      type: "triangle",
      gain: 0.035,
      slideTo: 360,
      filter: 2200,
    });
  }

  private playLanding(): void {
    this.tone(130, 0.12, {
      type: "sine",
      gain: 0.035,
      slideTo: 70,
    });
    this.noiseBurst(0.08, {
      filter: "lowpass",
      frequency: 480,
      gain: 0.025,
    });
  }

  /** Queda na água do gelo: splash curto e a chamada do resgate. */
  splash(): void {
    this.noiseBurst(0.34, {
      filter: "bandpass",
      frequency: 900,
      frequencyTo: 260,
      q: 0.6,
      gain: 0.09,
      attack: 0.004,
    });
    this.tone(240, 0.28, {
      type: "sine",
      gain: 0.055,
      slideTo: 60,
    });
    [72, 67].forEach((note, index) => {
      this.tone(midiToFrequency(note), 0.16, {
        type: "triangle",
        gain: 0.035,
        when: 0.12 + index * 0.11,
        filter: 2600,
      });
    });
  }

  private playDriftTier(tier: number): void {
    this.tone(720 + tier * 200, 0.09, {
      type: "triangle",
      gain: 0.04,
      filter: 5200,
    });
  }

  private playTireChirp(): void {
    this.noiseBurst(0.08, {
      filter: "bandpass",
      frequency: 1500,
      q: 2.4,
      gain: 0.025,
    });
  }

  private playWrongWay(): void {
    [220, 174].forEach((frequency, index) => {
      this.tone(frequency, 0.12, {
        type: "square",
        gain: 0.055,
        when: index * 0.14,
        filter: 1200,
      });
    });
  }

  private playCrowd(gain: number, when = 0): void {
    this.noiseBurst(1.5, {
      filter: "bandpass",
      frequency: 900,
      q: 0.45,
      gain,
      attack: 0.16,
      when,
    });
    this.noiseBurst(1.1, {
      filter: "bandpass",
      frequency: 1900,
      q: 0.5,
      gain: gain * 0.55,
      attack: 0.2,
      when: when + 0.05,
    });
  }

  private playMuteConfirm(): void {
    [660, 990].forEach((frequency, index) => {
      this.tone(frequency, 0.16, {
        type: "triangle",
        gain: 0.04,
        when: index * 0.07,
        filter: 4200,
      });
    });
  }

  private tone(frequency: number, duration: number, options: ToneOptions = {}): void {
    const context = this.context;
    if (!context || !this.sfxBus) return;
    const start = context.currentTime + (options.when ?? 0);
    const attack = Math.min(options.attack ?? 0.005, duration * 0.5);
    const oscillator = context.createOscillator();
    oscillator.type = options.type ?? "sine";
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
    if (options.slideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, options.slideTo),
        start + duration,
      );
    }
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, options.gain ?? 0.05),
      start + attack,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);

    let tail: AudioNode = envelope;
    let filter: BiquadFilterNode | null = null;
    if (options.filter) {
      filter = context.createBiquadFilter();
      filter.type = options.filterType ?? "lowpass";
      filter.frequency.value = options.filter;
      filter.Q.value = 0.9;
      envelope.connect(filter);
      tail = filter;
    }
    const panner = this.connectOutput(tail, options.pan ?? 0);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      filter?.disconnect();
      panner?.disconnect();
    };
  }

  private noiseBurst(duration: number, options: NoiseOptions = {}): void {
    const context = this.context;
    if (!context || !this.sfxBus || !this.noiseBuffer) return;
    const start = context.currentTime + (options.when ?? 0);
    const attack = Math.min(options.attack ?? 0.008, duration * 0.5);
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = options.filter ?? "lowpass";
    const frequency = options.frequency ?? 1200;
    filter.frequency.setValueAtTime(frequency, start);
    if (options.frequencyTo) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(20, options.frequencyTo),
        start + duration,
      );
    }
    filter.Q.value = options.q ?? 0.7;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, options.gain ?? 0.05),
      start + attack,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(envelope);
    const panner = this.connectOutput(envelope, options.pan ?? 0);
    const offset = Math.random() * Math.max(0, this.noiseBuffer.duration - 0.05);
    source.start(start, offset);
    source.stop(start + duration + 0.02);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
      panner?.disconnect();
    };
  }

  private connectOutput(node: AudioNode, pan: number): StereoPannerNode | null {
    if (!this.context || !this.sfxBus) return null;
    if (Math.abs(pan) < 0.01) {
      node.connect(this.sfxBus);
      return null;
    }
    const panner = this.context.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    node.connect(panner).connect(this.sfxBus);
    return panner;
  }

  private position(
    x: number,
    z: number,
    isPlayer: boolean,
  ): { pan: number; gain: number } {
    if (isPlayer) return { pan: 0, gain: 1 };
    const dx = x - this.listener.x;
    const dz = z - this.listener.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 40) return { pan: 0, gain: 0 };
    const rightX = -Math.cos(this.listener.yaw);
    const rightZ = Math.sin(this.listener.yaw);
    return {
      pan: clamp((dx * rightX + dz * rightZ) / 13, -0.85, 0.85),
      gain: clamp(1 - distance / 40, 0, 1) ** 1.5,
    };
  }

  private syncMuteUi(): void {
    if (typeof document === "undefined") return;
    const button = document.getElementById("start-sound");
    const label = document.getElementById("start-sound-label");
    if (button) {
      button.setAttribute("aria-pressed", String(!this.muted));
    }
    if (label) {
      label.textContent = this.muted ? "SOUND OFF" : "SOUND ON";
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.code !== "KeyM" ||
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    this.toggleMuted();
  };

  private readonly onVisibilityChange = (): void => {
    if (!this.context) return;
    if (document.hidden) {
      void this.context.suspend().catch(() => undefined);
    } else if (this.started) {
      void this.context.resume().catch(() => undefined);
    }
  };
}
