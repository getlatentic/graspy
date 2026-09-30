import type { AudioEvent } from "./audio-probe.ts";
import type { Finding } from "./checks.ts";
import type { Run } from "./turn-log.ts";

/** The lesson's own sound of silence, played on the first tap to unlock audio: shorter than any line. */
const SHORTEST_LINE_SECONDS = 0.3;
/** A line begins within this long of being on offer, or the child is left looking at a still screen. */
const LATE_START_MS = 2_500;
/** A line that never began is called missing once the next step is on offer or this long has passed. */
const MISSING_AFTER_MS = 15_000;
/** Stopped this much short of its length, a line was cut off. */
const CUT_OFF_SHARE = 0.9;
/** Silence between two lines of the teacher's that the child notices. */
const DEAD_AIR_MS = 3_500;

export interface Utterance {
  start: number;
  end: number | null;
  seconds: number | null;
  cutOff: boolean;
}

/** The lines actually voiced: from `playing` to the `ended` or `pause` that follows it. */
export function utterancesOf(events: AudioEvent[]): Utterance[] {
  const found: Utterance[] = [];
  let open: Utterance | null = null;
  for (const event of [...events].sort((a, b) => a.at - b.at)) {
    if (event.kind === "playing") {
      if ((event.seconds ?? Infinity) < SHORTEST_LINE_SECONDS) continue;
      if (open) found.push(open);
      open = { start: event.at, end: null, seconds: event.seconds ?? null, cutOff: false };
    } else if ((event.kind === "ended" || event.kind === "pause") && open) {
      open.end = event.at;
      open.cutOff = event.kind === "pause" && open.seconds !== null && (event.at - open.start) / 1000 < open.seconds * CUT_OFF_SHARE;
      found.push(open);
      open = null;
    }
  }
  if (open) found.push(open);
  return found;
}

const spoken = (utterances: Utterance[], at: number): Utterance | undefined =>
  utterances.find((line) => line.start <= at && (line.end === null || at <= line.end));

/** How long after `anchor` (or the end of the line then playing) the next line began; null when none did. */
function startDelay(utterances: Utterance[], anchor: number, until: number): number | null {
  const playing = utterances.find((line) => line.start < anchor && (line.end === null || anchor <= line.end));
  const from = playing?.end ?? anchor;
  const next = utterances.find((line) => line.start >= anchor && line.start >= from - 1);
  return next && next.start <= until ? Math.max(0, next.start - from) : null;
}

export interface SpeechTiming {
  turn: number;
  /** Milliseconds from the step being offered (and the previous line ending) to its first word. */
  firstWordMs: number | null;
  /** Milliseconds from the answer being marked to the teacher's reply beginning. */
  replyStartMs: number | null;
}

export function speechTimings(run: Run): SpeechTiming[] {
  const utterances = utterancesOf(run.audio ?? []);
  return run.turns.map((turn, at) => {
    const offered = turn.move.offeredAt ?? null;
    const nextOffered = run.turns[at + 1]?.move.offeredAt ?? Infinity;
    const marked = turn.marking?.at ?? null;
    return {
      turn: turn.index,
      firstWordMs: offered === null ? null : startDelay(utterances, offered, Math.min(nextOffered, offered + MISSING_AFTER_MS)),
      replyStartMs: marked === null ? null : startDelay(utterances, marked, marked + MISSING_AFTER_MS),
    };
  });
}

const finding = (check: string, severity: Finding["severity"], turn: number | null, detail: string): Finding => ({ check, severity, turn, detail });

/** The teacher's voice as the child hears it: late, missing, failed, cut off, over the child, or dead air between lines. */
export function speechFindings(run: Run): Finding[] {
  const events = run.audio;
  if (!events) return [];
  const utterances = utterancesOf(events);
  const found: Finding[] = [];
  for (const event of events) {
    if (event.kind === "error" || event.kind === "play-rejected")
      found.push(finding("voice-error", "concern", null, `The teacher's voice failed to play${event.why ? `: ${event.why}` : ""}.`));
  }
  utterances.forEach((line, i) => {
    if (line.cutOff) found.push(finding("voice-cut-off", "concern", null, `A line stopped short at ${((line.end! - line.start) / 1000).toFixed(1)} s of ${line.seconds!.toFixed(1)} s.`));
    const previous = utterances[i - 1];
    if (previous && (previous.end === null || line.start < previous.end - 50))
      found.push(finding("voices-overlap", "concern", null, "Two lines of the teacher's voice played at once."));
    if (previous && previous.end !== null && !previous.cutOff && line.start - previous.end > DEAD_AIR_MS) {
      const gap = line.start - previous.end;
      const answered = run.turns.some((turn) => turn.marking?.at && turn.marking.at >= previous.end! - 50 && turn.marking.at <= line.start);
      if (!answered) found.push(finding("dead-air", "note", null, `${(gap / 1000).toFixed(1)} s of silence between two lines with no answer being marked.`));
    }
  });
  const timings = speechTimings(run);
  run.turns.forEach((turn, at) => {
    if (turn.move.offeredAt === undefined || turn.move.offeredAt === null) return;
    const timing = timings[at];
    if (timing.firstWordMs === null) {
      const later = run.turns[at + 1]?.move.offeredAt ?? Infinity;
      const window = Math.min(later, turn.move.offeredAt + MISSING_AFTER_MS);
      if (!utterances.some((line) => line.start >= turn.move.offeredAt! && line.start <= window))
        found.push(finding("teacher-voice-missing", "concern", turn.index, `The line "${turn.move.says.slice(0, 50)}" was on screen and never spoken.`));
    } else if (timing.firstWordMs > LATE_START_MS) {
      found.push(finding("teacher-voice-late", "concern", turn.index, `${(timing.firstWordMs / 1000).toFixed(1)} s from the step being on screen to her first word.`));
    }
    if (timing.replyStartMs !== null && timing.replyStartMs > LATE_START_MS)
      found.push(finding("reply-voice-late", "concern", turn.index, `${(timing.replyStartMs / 1000).toFixed(1)} s from the answer being marked to her reply beginning.`));
    const recordedAt = turn.recordedAt;
    if (recordedAt !== undefined && spoken(utterances, recordedAt))
      found.push(finding("child-talked-over", "concern", turn.index, "The child's turn began while the teacher was still speaking."));
  });
  return found;
}

export function speechSummary(run: Run): string {
  const timings = speechTimings(run);
  const median = (values: number[]) => (values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null);
  const first = timings.flatMap((t) => (t.firstWordMs === null ? [] : [t.firstWordMs]));
  const reply = timings.flatMap((t) => (t.replyStartMs === null ? [] : [t.replyStartMs]));
  const seconds = (ms: number | null) => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)} s`);
  return `First word after a step is offered: median ${seconds(median(first))}, slowest ${seconds(first.length ? Math.max(...first) : null)} (${first.length} steps). Reply after an answer is marked: median ${seconds(median(reply))}, slowest ${seconds(reply.length ? Math.max(...reply) : null)} (${reply.length} replies).`;
}
