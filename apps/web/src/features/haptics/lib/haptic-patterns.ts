export type Cue = "press" | "correct" | "wrong" | "lessonComplete";

/** One effect on a controller: a single dual-rumble burst. Magnitudes stay at or under 0.2. */
export interface Rumble {
  duration: number;
  weak: number;
  strong: number;
}

/** No cue runs longer than this, so feedback never turns into a buzz. */
export const MAX_CUE_MS = 250;

/** Cues closer together than this are dropped, so rapid taps cannot buzz on and on. */
export const MIN_GAP_MS = 100;

/** Inside the gap a cue gets through only over a less important one. */
export const PRIORITY: Record<Cue, number> = {
  press: 0,
  correct: 1,
  wrong: 1,
  lessonComplete: 2,
};

/**
 * Milliseconds of motor on, off, on, ... as navigator.vibrate reads them. A
 * wrong answer is two short ticks, each gentler than the single pulse of a
 * right one: it informs and never punishes.
 */
export const PATTERNS: Record<Cue, readonly number[]> = {
  press: [12],
  correct: [35],
  wrong: [18, 70, 18],
  lessonComplete: [25, 55, 35, 60, 45],
};

export const RUMBLES: Record<Cue, Rumble> = {
  press: { duration: 20, weak: 0.1, strong: 0 },
  correct: { duration: 45, weak: 0.15, strong: 0.1 },
  wrong: { duration: 40, weak: 0.1, strong: 0 },
  lessonComplete: { duration: 140, weak: 0.2, strong: 0.15 },
};
