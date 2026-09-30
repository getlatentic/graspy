import { describe, expect, it } from "vitest";
import type { AudioEvent } from "./audio-probe.ts";
import { checkRun } from "./checks.ts";
import { speechSummary, speechTimings, utterancesOf } from "./speech-timing.ts";
import type { Marking, Run, Turn } from "./turn-log.ts";

const playing = (at: number, seconds = 3): AudioEvent => ({ at, kind: "playing", seconds });
const ended = (at: number): AudioEvent => ({ at, kind: "ended", seconds: 3 });

function turn(index: number, offeredAt: number | undefined, over: Partial<Turn> = {}): Turn {
  return {
    index,
    move: { kind: "event", planId: "p", eventId: `e${index}`, promptId: null, event: "present_content", says: `line ${index}`, shows: null, asksForAnswer: false, reason: null, offeredAt },
    child: null,
    answerAudio: null,
    marking: null,
    replyWaitMs: null,
    pageNote: null,
    screenshots: [],
    ...over,
  };
}

const marking = (at: number): Marking => ({ heard: "x", parsedAnswer: null, decision: "correct", feedback: "Well done.", provider: "whisper", latencyMs: 900, at });

const run = (turns: Turn[], audio: AudioEvent[]): Run => ({
  id: "r", voice: { engine: "e", reference: "voice-1", pitch: 1.2 }, persona: "sure", language: "en", learnerClass: "primary_4", plan: null,
  startedAt: "2026-09-30T00:00:00Z", finished: "rest", turns, audio,
});

const names = (r: Run) => checkRun(r).map((found) => found.check);

describe("the lines actually voiced", () => {
  it("run from playing to ended, and skip the unlock sound", () => {
    const lines = utterancesOf([playing(100, 0.05), ended(150), playing(1000), ended(4000)]);
    expect(lines).toEqual([{ start: 1000, end: 4000, seconds: 3, cutOff: false }]);
  });

  it("are cut off when stopped well short of their length", () => {
    const lines = utterancesOf([playing(0, 10), { at: 2000, kind: "pause", seconds: 10 }]);
    expect(lines[0].cutOff).toBe(true);
  });
});

describe("speech timing", () => {
  it("measures the first word from the step being offered", () => {
    const r = run([turn(1, 1000)], [playing(1600), ended(4600)]);
    expect(speechTimings(r)[0].firstWordMs).toBe(600);
    expect(names(r)).toEqual([]);
  });

  it("measures a step offered while the last line still plays from that line's end", () => {
    const r = run([turn(1, 1000), turn(2, 2000)], [playing(1000), ended(4000), playing(4400), ended(6000)]);
    expect(speechTimings(r).map((t) => t.firstWordMs)).toEqual([0, 400]);
  });

  it("flags a first word that comes late and a line never spoken", () => {
    expect(names(run([turn(1, 1000)], [playing(6000), ended(9000)]))).toEqual(["teacher-voice-late"]);
    expect(names(run([turn(1, 1000), turn(2, 30_000)], [playing(1200), ended(4000)]))).toEqual(["teacher-voice-missing"]);
  });

  it("flags a reply that begins late after the answer is marked", () => {
    const answered = turn(1, 1000, { marking: marking(10_000) });
    expect(names(run([answered], [playing(1200), ended(4000), playing(15_000), ended(17_000)]))).toContain("reply-voice-late");
    expect(speechTimings(run([answered], [playing(1200), ended(4000), playing(11_000), ended(12_000)]))[0].replyStartMs).toBe(1000);
  });

  it("flags voices failing, overlapping, cut off, and the child talking over the teacher", () => {
    expect(names(run([turn(1, 1000)], [playing(1100), { at: 1200, kind: "play-rejected", why: "blocked" }]))).toContain("voice-error");
    expect(names(run([turn(1, 1000)], [playing(1100), playing(2000), ended(5000)]))).toContain("voices-overlap");
    expect(names(run([turn(1, 1000)], [playing(1100, 10), { at: 2000, kind: "pause", seconds: 10 }]))).toContain("voice-cut-off");
    expect(names(run([turn(1, 1000, { recordedAt: 2000 })], [playing(1100), ended(5000)]))).toContain("child-talked-over");
    expect(names(run([turn(1, 1000, { recordedAt: 6000 })], [playing(1100), ended(5000)]))).not.toContain("child-talked-over");
  });

  it("notes dead air between two lines with nothing being marked", () => {
    expect(names(run([turn(1, 1000), turn(2, 2000)], [playing(1000), ended(4000), playing(9000), ended(12_000)]))).toContain("dead-air");
  });

  it("says nothing when the audio was not measured, and summarises what was", () => {
    const measured = { ...run([turn(1, 1000)], []), audio: undefined };
    expect(names(measured)).toEqual([]);
    expect(speechSummary(run([turn(1, 1000)], [playing(1500), ended(3000)]))).toContain("median 0.5 s");
  });
});
