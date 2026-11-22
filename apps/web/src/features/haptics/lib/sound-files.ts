import type { Cue } from "./haptic-patterns";

/**
 * The recorded sound of each cue, from Kenney's CC0 packs (docs/THIRD_PARTY_AUDIO.md).
 * A changed recording needs a new version in its name: public/sw.js keeps these by path.
 */
export const SOUND_FILES: Record<Cue, string> = {
  select: "/sounds/select-v1.wav",
  press: "/sounds/press-v1.wav",
  correct: "/sounds/correct-v1.wav",
  wrong: "/sounds/wrong-v1.wav",
  lessonComplete: "/sounds/complete-v1.m4a",
};

/** Playback level, 0 to 1; the files are peak-normalised, so this is the loudness a child hears. */
export const VOLUME = 0.5;

/** A file that has not arrived by now is given up on until it is asked for again. */
export const FETCH_TIMEOUT_MS = 10_000;

/** After a failed fetch a file waits this long before it is asked for again, doubling with each failure up to the longest. */
export const RETRY_BASE_MS = 2_000;
export const RETRY_MAX_MS = 60_000;
