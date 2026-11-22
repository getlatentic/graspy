import type { Output } from "./haptic-device";
import type { Cue } from "./haptic-patterns";
import {
  DECODE_TIMEOUT_MS,
  MAX_DECODE_ATTEMPTS,
  PENDING_CUE_MS,
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
  /** Whether the learner has Sounds on. Off, nothing is fetched, decoded, created or woken. */
  enabled: () => boolean;
}

const CUES = Object.keys(SOUND_FILES) as Cue[];

/** The cues that answer the learner's work: one that arrives while the audio wakes still plays, if it is fresh. */
const WAITS_FOR_AUDIO: ReadonlySet<Cue> = new Set([
  "correct",
  "wrong",
  "lessonComplete",
]);

/** Settles with the decoded buffer, or rejects when the decode fails or takes longer than DECODE_TIMEOUT_MS. */
function decodeWithin(
  context: AudioContext,
  data: ArrayBuffer,
): Promise<AudioBuffer> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("decode timed out")),
      DECODE_TIMEOUT_MS,
    );
  });
  return Promise.race([context.decodeAudioData(data), timeout]).finally(() =>
    clearTimeout(timer),
  );
}

/**
 * Recorded cue sounds through Web Audio. One AudioContext serves the whole app.
 * The bytes are fetched once the page is idle, with no context and no gesture;
 * they are decoded into buffers by the first gesture, which also creates the
 * context, because a browser lets a context make sound only after one. iOS puts
 * the context back to "suspended" or "interrupted" after a call or a lock, so
 * every gesture wakes it. A cue that comes while it sleeps, or before its
 * buffer exists, is dropped, never played late; except that the latest answer
 * cue (right, wrong, lesson done) waits one slot for PENDING_CUE_MS, because a
 * graded answer from a lesson's frame comes with no gesture to wake the audio
 * first. A stop (a hold, a hidden page) empties the slot.
 *
 * A failed fetch (the network) waits, longer each time, and is tried again
 * when something asks after the wait or the network returns; many gestures in
 * a burst spend one try. A recording that fails to decode is tried a few more
 * times, a wait apart, then given up (a codec this browser lacks); a decode
 * that hangs counts as failed. Either way that cue is silent, with no error.
 */
export function createSound({
  makeContext,
  fetchBytes,
  now,
  enabled,
}: SoundDeps): Sound {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  const bytes = new Map<Cue, ArrayBuffer>();
  const buffers = new Map<Cue, AudioBuffer>();
  const fetching = new Set<Cue>();
  const decoding = new Set<Cue>();
  const undecodable = new Set<Cue>();
  const failedFetches = new Map<Cue, number>();
  const failedDecodes = new Map<Cue, number>();
  const waitUntil = new Map<Cue, number>();
  const sounding = new Set<AudioBufferSourceNode>();
  let pending: { cue: Cue; at: number } | null = null;

  const waiting = (cue: Cue) => (waitUntil.get(cue) ?? 0) > now();

  const ready = (cue: Cue) =>
    context !== null &&
    master !== null &&
    context.state === "running" &&
    buffers.has(cue);

  function start(cue: Cue) {
    if (!context || !master) return;
    const source = context.createBufferSource();
    source.buffer = buffers.get(cue) ?? null;
    source.connect(master);
    sounding.add(source);
    source.onended = () => {
      sounding.delete(source);
      source.disconnect();
    };
    source.start();
  }

  const flush = () => {
    const waited = pending;
    if (!waited || !ready(waited.cue)) return;
    pending = null;
    if (now() - waited.at <= PENDING_CUE_MS) start(waited.cue);
  };

  const backOff = (cue: Cue, failed: number) => {
    const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failed - 1));
    waitUntil.set(cue, now() + wait);
  };

  async function decode(cue: Cue) {
    const data = bytes.get(cue);
    if (!enabled() || !context || !data || decoding.has(cue) || waiting(cue)) {
      return;
    }
    decoding.add(cue);
    try {
      // decodeAudioData takes its argument's memory, so a copy is kept for a retry.
      buffers.set(cue, await decodeWithin(context, data.slice(0)));
      bytes.delete(cue);
      flush();
    } catch {
      const failed = (failedDecodes.get(cue) ?? 0) + 1;
      failedDecodes.set(cue, failed);
      if (failed >= MAX_DECODE_ATTEMPTS) {
        undecodable.add(cue);
        bytes.delete(cue);
      } else {
        backOff(cue, failed);
      }
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
      backOff(cue, failed);
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
    !waiting(cue);

  const prefetch = () => {
    if (makeContext === undefined || !enabled()) return;
    for (const cue of CUES) if (wanted(cue)) void fetchOne(cue);
  };

  const play = (cue: Cue) => {
    if (ready(cue)) start(cue);
    else if (WAITS_FOR_AUDIO.has(cue)) pending = { cue, at: now() };
  };

  const wake = () => {
    if (!enabled() || !context || context.state === "running") return;
    void context.resume().then(flush, () => undefined);
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
      for (const cue of CUES) void decode(cue);
    }),
    resume: guarded(wake),
    unlock: guarded(() => {
      if (!enabled()) return;
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
        pending = null;
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
