import type { Cue } from "./haptic-patterns";

/**
 * The recorded sound of each cue, from Kenney's CC0 packs (docs/THIRD_PARTY_AUDIO.md).
 * A changed recording needs a new version in its name: public/sw.js keeps these by path.
 */
export const SOUND_FILES: Record<Cue, string> = {
  select: "/sounds/select-v2.wav",
  press: "/sounds/press-v2.wav",
  correct: "/sounds/correct-v2.wav",
  wrong: "/sounds/wrong-v2.wav",
  lessonComplete: "/sounds/complete-v2.m4a",
};

/**
 * Playback level, 0 to 1. The level of each cue is in its file (peaks of -3
 * dBFS, the wrong answer's -9), so this stays at full and the device's own
 * volume is the control. The earlier level (files at -12 dBFS, played at 0.5)
 * put the 55 ms select tick at -18 dBFS, too quiet for a TV's speakers.
 */
export const VOLUME = 1;

/** A file that has not arrived by now is given up on until it is asked for again. */
export const FETCH_TIMEOUT_MS = 10_000;

/** A decode that has not finished by now has failed. */
export const DECODE_TIMEOUT_MS = 10_000;

/** A recording that fails to decode this many times is not tried again. */
export const MAX_DECODE_ATTEMPTS = 3;

/** An answer cue that came before the audio was awake plays when it wakes, if it is no older than this. */
export const PENDING_CUE_MS = 1_500;

/** A select or press that came while its recording was still being fetched or decoded (the first tap of a visit) plays when it is ready, if it is no older than this. */
export const PENDING_TAP_MS = 400;

/** After a failed fetch a file waits this long before it is asked for again, doubling with each failure up to the longest. */
export const RETRY_BASE_MS = 2_000;
export const RETRY_MAX_MS = 60_000;
