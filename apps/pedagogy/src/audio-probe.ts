import type { Page } from "playwright-core";

/** One thing the page's audio elements did, with the time on the shared clock. */
export interface AudioEvent {
  at: number;
  kind: "play-called" | "playing" | "ended" | "pause" | "error" | "play-rejected";
  /** The length of the recording in seconds, when the element knew it. */
  seconds?: number | null;
  why?: string;
}

/**
 * Runs in the page before it loads: records when the teacher's voice, which the app plays through an audio
 * element, starts, ends, stops short or fails. The child's microphone is not an audio element, so it is not
 * seen here. `Date.now()` is the clock the run's own timestamps use.
 */
export const AUDIO_PROBE = `(() => {
  const log = (window.__audioLog = []);
  const push = (kind, extra) => log.push({ at: Date.now(), kind, ...extra });
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    push("play-called", {});
    const result = play.apply(this, args);
    if (result && result.catch) result.catch((error) => push("play-rejected", { why: String(error).slice(0, 80) }));
    return result;
  };
  for (const kind of ["playing", "ended", "pause", "error"]) {
    document.addEventListener(kind, (event) => {
      const element = event.target;
      if (!(element instanceof HTMLMediaElement)) return;
      const seconds = Number.isFinite(element.duration) ? element.duration : null;
      push(kind, { seconds });
    }, true);
  }
})();`;

export async function installAudioProbe(page: Page): Promise<void> {
  await page.addInitScript(AUDIO_PROBE);
}

export async function readAudioLog(page: Page): Promise<AudioEvent[]> {
  return page.evaluate(() => (window as unknown as { __audioLog?: AudioEvent[] }).__audioLog ?? []);
}
