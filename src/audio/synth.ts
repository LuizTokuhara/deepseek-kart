/** Pequenos geradores de áudio usados por motores, pneus e música. */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function normalize(data: Float32Array, peak = 0.9): void {
  let max = 0;
  for (let index = 0; index < data.length; index++) {
    max = Math.max(max, Math.abs(data[index]));
  }
  if (max <= 0.00001) return;
  const scale = peak / max;
  for (let index = 0; index < data.length; index++) {
    data[index] *= scale;
  }
}

/** Ruído branco com um leve corpo grave, compartilhado por pneus e torcida. */
export function createNoiseBuffer(
  context: AudioContext,
  seconds = 2,
): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x5f3759df;
  let body = 0;
  const random = (): number => {
    seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };
  for (let index = 0; index < length; index++) {
    const white = random();
    body = body * 0.985 + white * 0.015;
    data[index] = white * 0.72 + body * 2.4;
  }
  normalize(data, 0.82);
  return buffer;
}

/** Resposta curta de ambiente externo, usada como send de SFX e música. */
export function createReverbImpulse(
  context: AudioContext,
  seconds = 1.1,
  decay = 3.2,
): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let index = 0; index < length; index++) {
      const progress = index / length;
      const envelope = (1 - progress) ** decay;
      low = low * 0.72 + (Math.random() * 2 - 1) * 0.28;
      data[index] = low * envelope;
    }
  }
  return buffer;
}

/** Motor de arcade com harmônicos arredondados e uma pulsação de escapamento. */
export function createEngineBuffer(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 0.5);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  // Ciclos inteiros deixam a transição do loop contínua em qualquer sample rate.
  for (let index = 0; index < length; index++) {
    const turn = (2 * Math.PI * index) / length;
    const phase = turn * 48 + Math.sin(turn * 3) * 0.24;
    const buzz =
      Math.sin(phase) * 0.38 +
      Math.sin(phase * 2 + 0.4) * 0.32 +
      Math.sin(phase * 3 + 0.8) * 0.21 +
      Math.sin(phase * 4 + 1.2) * 0.12 +
      Math.sin(phase * 5 + 1.6) * 0.07;
    const pulse = 0.9 + Math.sin(turn * 6) * 0.1;
    data[index] = buzz * pulse;
  }

  normalize(data, 0.9);
  return buffer;
}
