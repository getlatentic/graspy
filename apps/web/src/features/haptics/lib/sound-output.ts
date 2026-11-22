import type { Output } from "./haptic-device";
import type { Cue } from "./haptic-patterns";
import { ATTACK_S, PEAK_GAIN, TONES } from "./sound-tones";

export interface Sound {
  output: Output;
  /** Creates the one shared context, and wakes it if the browser or a call put it to sleep. Call inside a gesture. */
  unlock(): void;
}

/**
 * Short tones from Web Audio: no files, so they work offline and need no
 * change to the content security policy. One AudioContext serves the whole
 * app. iOS lets it make sound only after it was resumed inside a gesture, and
 * puts it back to "suspended" or "interrupted" after a call or a lock, so every
 * gesture wakes it; a cue that comes while it sleeps is dropped, never queued
 * to play late.
 */
export function createSound(
  makeContext: (() => AudioContext) | undefined,
): Sound {
  let context: AudioContext | null = null;
  const sounding = new Set<OscillatorNode>();

  const play = (cue: Cue) => {
    if (!context || context.state !== "running") return;
    const ctx = context;
    for (const { hz, at, length } of TONES[cue]) {
      const start = ctx.currentTime + at;
      const end = start + length;
      const note = ctx.createOscillator();
      const level = ctx.createGain();
      note.frequency.value = hz;
      level.gain.setValueAtTime(0.0001, start);
      level.gain.linearRampToValueAtTime(PEAK_GAIN, start + ATTACK_S);
      level.gain.exponentialRampToValueAtTime(0.0001, end);
      note.connect(level).connect(ctx.destination);
      sounding.add(note);
      note.onended = () => {
        sounding.delete(note);
        note.disconnect();
        level.disconnect();
      };
      note.start(start);
      note.stop(end + 0.01);
    }
  };

  return {
    unlock: () => {
      try {
        context ??= makeContext?.() ?? null;
        if (context && context.state !== "running") {
          void context.resume().catch(() => undefined);
        }
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
        for (const note of sounding) {
          try {
            note.stop();
          } catch {
            // Already ended.
          }
        }
      },
    },
  };
}
