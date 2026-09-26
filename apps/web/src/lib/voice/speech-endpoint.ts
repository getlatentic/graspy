// As the Android app judges a child's answer: loudness a tenth of a second at a time.

const QUIET_DBFS = -55;
const LOUD_DBFS = -6;
/** A voice rather than a room: about -35 dBFS on the 0 to 1 scale. */
const SPEECH_LEVEL = 0.4;
/** Below this the whole take held no sound worth sending. */
export const MINIMUM_AUDIBLE_RMS = 64;

/** The samples in one level window: a tenth of a second at 16 kHz. */
export const WINDOW_SAMPLES = 1_600;

export function rms(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

/** Loudness from 0, a quiet room, to 1, a child close to the microphone, in decibels. */
export function loudness(value: number): number {
  if (value <= 0) return 0;
  const dbfs = 20 * Math.log10(value / 32767);
  const scaled = (dbfs - QUIET_DBFS) / (LOUD_DBFS - QUIET_DBFS);
  return Math.max(0, Math.min(1, scaled));
}

export type EndpointState = "waiting" | "speaking" | "finished" | "nothing";

/**
 * Where an answer starts and ends. A cough is too short to start it, a breath mid-answer too
 * short to end it, and a take in which nobody speaks is recognised, so it is never sent.
 */
export class SpeechEndpoint {
  state: EndpointState = "waiting";
  private loudInARow = 0;
  private quietInARow = 0;
  private windows = 0;

  private readonly startWindows: number;
  private readonly endWindows: number;
  private readonly waitWindows: number;

  /** In tenths of a second: loud to start, quiet to end, and how long to wait for a voice. */
  constructor(startWindows = 3, endWindows = 12, waitWindows = 80) {
    this.startWindows = startWindows;
    this.endWindows = endWindows;
    this.waitWindows = waitWindows;
  }

  add(level: number): EndpointState {
    this.windows += 1;
    const loud = level >= SPEECH_LEVEL;
    if (this.state === "waiting") {
      this.loudInARow = loud ? this.loudInARow + 1 : 0;
      if (this.loudInARow >= this.startWindows) this.state = "speaking";
      else if (this.windows >= this.waitWindows) this.state = "nothing";
    } else if (this.state === "speaking") {
      this.quietInARow = loud ? 0 : this.quietInARow + 1;
      if (this.quietInARow >= this.endWindows) this.state = "finished";
    }
    return this.state;
  }
}
