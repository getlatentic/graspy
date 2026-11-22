import type { Output } from "./haptic-device";
import type { Cue } from "./haptic-patterns";
import {
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  SOUND_FILES,
  VOLUME,
} from "./sound-files";

export interface Sound {
  output: Output;
  /** Fetches the recordings not yet fetched, those waiting out a failure excepted. Safe to call at any time, with no gesture. */
  prefetch(): void;
  /** Forgets the waiting after failed fetches, as when the network returns, and fetches again. */
  retry(): void;
  /** Creates the one shared context, wakes it if it sleeps, and decodes the fetched recordings. Call inside a gesture. */
  unlock(): void;
  /** Wakes the context if one exists and sleeps (the page came back to the front). Never creates one. */
  resume(): void;
}

export interface SoundDeps {
  makeContext: (() => AudioContext) | undefined;
  /** Fetches a file's bytes; rejects when it cannot. */
  fetchBytes: (url: string) => Promise<ArrayBuffer>;
  /** A monotonic clock in milliseconds. */
  now: () => number;
}

const CUES = Object.keys(SOUND_FILES) as Cue[];

/**
 * Recorded cue sounds through Web Audio. One AudioContext serves the whole app.
 * The bytes are fetched once the page is idle, with no context and no gesture;
 * they are decoded into buffers by the first gesture, which also creates the
 * context, because a browser lets a context make sound only after one. iOS puts
 * the context back to "suspended" or "interrupted" after a call or a lock, so
 * every gesture wakes it. A cue that comes while it sleeps, or before its
 * buffer exists, is dropped, never queued to play late.
 *
 * A failed fetch (the network) waits, longer each time, and is tried again
 * when something asks after the wait or the network returns; many gestures in
 * a burst spend one try. A recording that cannot be decoded (a codec this
 * browser lacks) is not tried again. Either way that cue is silent, with no error.
 */
export function createSound({
  makeContext,
  fetchBytes,
  now,
}: SoundDeps): Sound {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  const bytes = new Map<Cue, ArrayBuffer>();
  const buffers = new Map<Cue, AudioBuffer>();
  const fetching = new Set<Cue>();
  const decoding = new Set<Cue>();
  const undecodable = new Set<Cue>();
  const failedFetches = new Map<Cue, number>();
  const waitUntil = new Map<Cue, number>();
  const sounding = new Set<AudioBufferSourceNode>();

  async function decode(cue: Cue) {
    const data = bytes.get(cue);
    if (!context || !data || decoding.has(cue)) return;
    decoding.add(cue);
    bytes.delete(cue);
    try {
      buffers.set(cue, await context.decodeAudioData(data));
    } catch {
      undecodable.add(cue);
    } finally {
      decoding.delete(cue);
    }
  }

  async function fetchOne(cue: Cue) {
    fetching.add(cue);
    try {
      bytes.set(cue, await fetchBytes(SOUND_FILES[cue]));
      failedFetches.delete(cue);
      waitUntil.delete(cue);
    } catch {
      const failed = (failedFetches.get(cue) ?? 0) + 1;
      failedFetches.set(cue, failed);
      const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failed - 1));
      waitUntil.set(cue, now() + wait);
    } finally {
      fetching.delete(cue);
    }
    void decode(cue);
  }

  const wanted = (cue: Cue) =>
    !bytes.has(cue) &&
    !buffers.has(cue) &&
    !fetching.has(cue) &&
    !decoding.has(cue) &&
    !undecodable.has(cue) &&
    (waitUntil.get(cue) ?? 0) <= now();

  const prefetch = () => {
    if (makeContext === undefined) return;
    for (const cue of CUES) if (wanted(cue)) void fetchOne(cue);
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
    if (context && context.state !== "running") {
      void context.resume().catch(() => undefined);
    }
  };

  const guarded = (work: () => void) => () => {
    try {
      work();
    } catch {
      // No audio on this device: the cues stay silent.
    }
  };

  return {
    prefetch: guarded(prefetch),
    retry: guarded(() => {
      waitUntil.clear();
      prefetch();
    }),
    resume: guarded(wake),
    unlock: guarded(() => {
      if (!context) {
        context = makeContext?.() ?? null;
        if (!context) return;
        master = context.createGain();
        master.gain.value = VOLUME;
        master.connect(context.destination);
      }
      wake();
      prefetch();
      for (const cue of CUES) void decode(cue);
    }),
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
