import type { Output } from "./haptic-device";
import type { Cue } from "./haptic-patterns";
import { MAX_ATTEMPTS, SOUND_FILES, VOLUME } from "./sound-files";

export interface Sound {
  output: Output;
  /** Creates the one shared context, wakes it if the browser or a call put it to sleep, and starts loading the recordings. Call inside a gesture. */
  unlock(): void;
}

/** Fetches a file's bytes; rejects when it cannot. */
export type FetchBytes = (url: string) => Promise<ArrayBuffer>;

const CUES = Object.keys(SOUND_FILES) as Cue[];

/**
 * Recorded cue sounds through Web Audio. One AudioContext serves the whole app.
 * iOS lets it make sound only after it was resumed inside a gesture, and puts it
 * back to "suspended" or "interrupted" after a call or a lock, so every gesture
 * wakes it; a cue that comes while it sleeps, or before its recording is
 * decoded, is dropped, never queued to play late. Recordings are fetched and
 * decoded once, on the first gesture, so the first paint does not wait for them;
 * one that cannot be fetched or decoded stays silent.
 */
export function createSound(
  makeContext: (() => AudioContext) | undefined,
  fetchBytes: FetchBytes,
): Sound {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  const buffers = new Map<Cue, AudioBuffer>();
  const loading = new Set<Cue>();
  const failures = new Map<Cue, number>();
  const sounding = new Set<AudioBufferSourceNode>();

  async function load(ctx: AudioContext, cue: Cue) {
    loading.add(cue);
    try {
      const bytes = await fetchBytes(SOUND_FILES[cue]);
      buffers.set(cue, await ctx.decodeAudioData(bytes));
    } catch {
      failures.set(cue, (failures.get(cue) ?? 0) + 1);
    } finally {
      loading.delete(cue);
    }
  }

  const loadMissing = (ctx: AudioContext) => {
    for (const cue of CUES) {
      if (buffers.has(cue) || loading.has(cue)) continue;
      if ((failures.get(cue) ?? 0) >= MAX_ATTEMPTS) continue;
      void load(ctx, cue);
    }
  };

  const play = (cue: Cue) => {
    const buffer = buffers.get(cue);
    if (!context || !master || !buffer || context.state !== "running") return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(master);
    sounding.add(source);
    source.onended = () => {
      sounding.delete(source);
      source.disconnect();
    };
    source.start();
  };

  const wake = () => {
    if (!context) {
      context = makeContext?.() ?? null;
      if (!context) return;
      master = context.createGain();
      master.gain.value = VOLUME;
      master.connect(context.destination);
    }
    if (context.state !== "running") {
      void context.resume().catch(() => undefined);
    }
    loadMissing(context);
  };

  return {
    unlock: () => {
      try {
        wake();
      } catch {
        // No audio on this device: the cues stay silent.
      }
    },
    output: {
      available: () => makeContext !== undefined,
      channel: "sound",
      needsActivation: true,
      play,
      stop: () => {
        for (const source of sounding) {
          try {
            source.stop();
          } catch {
            // Already ended.
          }
        }
      },
    },
  };
}
