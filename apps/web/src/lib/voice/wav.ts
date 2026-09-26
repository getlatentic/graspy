/** What Intron's recognizer reads: 16 kHz, one channel, 16-bit PCM. */
export const SAMPLE_RATE = 16_000;
const HEADER_BYTES = 44;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;

/** A RIFF WAVE file of mono 16-bit little-endian PCM. */
export function encodeWav(
  samples: Int16Array,
  sampleRate = SAMPLE_RATE,
): ArrayBuffer {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i += 1)
      view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * CHANNELS * BYTES_PER_SAMPLE, true);
  view.setUint16(32, CHANNELS * BYTES_PER_SAMPLE, true);
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  new Int16Array(buffer, HEADER_BYTES).set(samples);
  return buffer;
}

/** Float samples in [-1, 1] as 16-bit integers, clipped rather than wrapped. */
export function toPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clipped = Math.max(-1, Math.min(1, samples[i]));
    out[i] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
  }
  return out;
}

/**
 * The microphone's rate brought down to 16 kHz, each output sample the mean of the input
 * samples it covers: averaging is the low-pass that keeps speech from aliasing.
 */
export function downsample(
  samples: Float32Array,
  fromRate: number,
  toRate = SAMPLE_RATE,
): Float32Array {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += samples[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}
