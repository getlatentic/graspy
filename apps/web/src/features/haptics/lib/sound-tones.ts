import type { Cue } from "./haptic-patterns";

/** A sine note: its pitch, when it starts after the cue and how long it rings, in seconds. */
export interface Note {
  hz: number;
  at: number;
  length: number;
}

/** Loudness of the loudest moment of a note; soft enough for a child's ears and a phone's speaker. */
export const PEAK_GAIN = 0.15;

/** A note rises over this long and then dies away, so it starts and ends without a click. */
export const ATTACK_S = 0.004;

/** No cue sounds longer than this. */
export const MAX_TONE_S = 0.4;

/**
 * The select tick is one short high note. A right answer climbs a fourth; a
 * wrong one is lower, softer in pitch and falls a whole tone, gentle and never
 * sharp; a finished lesson is a rising three-note arpeggio (C, E, G).
 */
export const TONES: Record<Cue, readonly Note[]> = {
  press: [{ hz: 1200, at: 0, length: 0.022 }],
  correct: [
    { hz: 660, at: 0, length: 0.07 },
    { hz: 880, at: 0.075, length: 0.1 },
  ],
  wrong: [
    { hz: 330, at: 0, length: 0.09 },
    { hz: 294, at: 0.1, length: 0.13 },
  ],
  lessonComplete: [
    { hz: 523, at: 0, length: 0.08 },
    { hz: 659, at: 0.09, length: 0.08 },
    { hz: 784, at: 0.18, length: 0.2 },
  ],
};
