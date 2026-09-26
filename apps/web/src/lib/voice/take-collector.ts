import {
  loudness,
  MINIMUM_AUDIBLE_RMS,
  rms,
  SpeechEndpoint,
  type EndpointState,
} from "./speech-endpoint";
import { downsample, encodeWav, toPcm16 } from "./wav";

/**
 * One take: the microphone's samples at its own rate, kept as 16 kHz PCM a tenth of a second
 * at a time, each tenth measured for the voice wave and for where the answer ends.
 */
export class TakeCollector {
  private readonly window: number;
  private pending = new Float32Array(0);
  private readonly pieces: Int16Array[] = [];
  private squares = 0;
  private count = 0;
  private readonly endpoint = new SpeechEndpoint();

  private readonly inputRate: number;
  private readonly onLevel: (level: number, state: EndpointState) => void;

  constructor(
    inputRate: number,
    onLevel: (level: number, state: EndpointState) => void,
  ) {
    this.inputRate = inputRate;
    this.onLevel = onLevel;
    this.window = Math.round(inputRate / 10);
  }

  add(chunk: Float32Array): void {
    const joined = new Float32Array(this.pending.length + chunk.length);
    joined.set(this.pending);
    joined.set(chunk, this.pending.length);
    let at = 0;
    for (; at + this.window <= joined.length; at += this.window) {
      this.measure(joined.subarray(at, at + this.window));
    }
    this.pending = joined.slice(at);
  }

  private measure(raw: Float32Array): void {
    const pcm = toPcm16(downsample(raw, this.inputRate));
    this.pieces.push(pcm);
    const level = rms(pcm);
    this.squares += level * level * pcm.length;
    this.count += pcm.length;
    this.onLevel(loudness(level), this.endpoint.add(loudness(level)));
  }

  /** Whether anything louder than a room was captured. */
  get audible(): boolean {
    return (
      this.count > 0 &&
      Math.sqrt(this.squares / this.count) >= MINIMUM_AUDIBLE_RMS
    );
  }

  wav(): Blob {
    const samples = new Int16Array(this.count);
    let at = 0;
    for (const piece of this.pieces) {
      samples.set(piece, at);
      at += piece.length;
    }
    return new Blob([encodeWav(samples)], { type: "audio/wav" });
  }
}
