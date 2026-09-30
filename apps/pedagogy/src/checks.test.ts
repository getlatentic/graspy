import { describe, expect, it } from "vitest";
import { checkRun } from "./checks.ts";
import type { Marking, Run, Turn } from "./turn-log.ts";

function turn(index: number, over: Partial<Turn> & { says?: string; event?: string } = {}): Turn {
  const { says = `line ${index}`, event = "elicit_performance", ...rest } = over;
  return {
    index,
    move: { kind: "event", planId: "p", eventId: `e${index}`, promptId: null, event, says, shows: null, asksForAnswer: true, reason: null },
    child: null,
    answerAudio: null,
    marking: null,
    replyWaitMs: null,
    pageNote: null,
    screenshots: [],
    ...rest,
  };
}

const marking = (over: Partial<Marking>): Marking => ({
  heard: "fifty six",
  parsedAnswer: 56,
  decision: "correct",
  feedback: "Well done",
  provider: "intron",
  latencyMs: 900,
  ...over,
});

const run = (turns: Turn[]): Run => ({
  id: "r", voice: { engine: "e", reference: "voice-1", pitch: 1.2 }, persona: "sure", language: "en", learnerClass: "primary_4", plan: null,
  startedAt: "2026-09-29T00:00:00Z", finished: "rest", turns,
});

const names = (turns: Turn[]) => checkRun(run(turns)).map((found) => found.check);

describe("checkRun", () => {
  it("finds nothing wrong in a right answer marked right", () => {
    const answered = turn(1, { child: { said: "fifty six", isRight: true, note: "" }, marking: marking({}) });
    expect(names([answered])).toEqual([]);
  });

  it("flags a right answer that was not accepted, when it was heard faithfully", () => {
    const answered = turn(1, {
      child: { said: "fifty six", isRight: true, note: "" },
      marking: marking({ decision: "try_again" }),
    });
    expect(names([answered])).toEqual(["right-answer-not-accepted"]);
  });

  it("flags a wrong answer that was accepted", () => {
    const answered = turn(1, {
      child: { said: "fifty six", isRight: false, note: "" },
      marking: marking({}),
    });
    expect(names([answered])).toEqual(["wrong-answer-accepted"]);
  });

  it("blames the recogniser, not the teacher, when the hearing was off", () => {
    const answered = turn(1, {
      child: { said: "fifty six", isRight: true, note: "" },
      marking: marking({ heard: "fifteen", decision: "try_again" }),
    });
    expect(names([answered])).toEqual(["recogniser-misheard"]);
  });

  it("flags the same line three times running", () => {
    expect(names([turn(1, { says: "Say it" }), turn(2, { says: "Say it" }), turn(3, { says: "Say it" })])).toEqual([
      "same-line-repeated",
    ]);
  });

  it("flags identical feedback to a child who is still wrong", () => {
    const wrong = (i: number) =>
      turn(i, { child: { said: "one", isRight: false, note: "" }, marking: marking({ heard: "one", decision: "try_again", feedback: "Try again" }) });
    expect(names([wrong(1), wrong(2)])).toEqual(["feedback-repeated"]);
  });

  it("flags a line too long for a child", () => {
    const long = Array(30).fill("word").join(" ");
    expect(names([turn(1, { child: { said: "fifty", isRight: false, note: "" }, marking: marking({ heard: "fifty", parsedAnswer: 50, decision: "try_again", feedback: long }) })])).toEqual(["line-too-long"]);
    expect(checkRun(run([turn(1, { says: long })])).map((found) => [found.check, found.severity])).toEqual([["plan-line-long", "note"]]);
  });

  it("flags a silent child the page never answered, but not one it did", () => {
    const silent = { said: null, isRight: null, note: "" };
    expect(names([turn(1, { child: silent })])).toEqual(["silence-unanswered"]);
    expect(names([turn(1, { child: silent, pageNote: "I couldn't hear you. Say it again." })])).toEqual([]);
  });

  it("flags a long wait for the outcome", () => {
    const answered = turn(1, { child: { said: "fifty six", isRight: true, note: "" }, marking: marking({}), replyWaitMs: 12_000 });
    expect(names([answered])).toEqual(["slow-reply"]);
  });

  it("flags an answer that was only kept, never marked", () => {
    const kept = turn(1, { child: { said: "fifty six", isRight: true, note: "" }, pageNote: "Saved. It'll be checked soon." });
    expect(names([kept])).toEqual(["answer-not-marked"]);
  });

  it("does not note a new lesson starting its events again, or the guided practice shown again after a miss", () => {
    const other = (index: number, event: string) => ({ ...turn(index, { event }), move: { ...turn(index, { event }).move, planId: "q" } });
    expect(names([turn(1, { event: "enhance_retention" }), other(2, "gain_attention")])).toEqual([]);
    const missed = turn(1, { event: "elicit_performance", child: { said: "no", isRight: false, note: "" }, marking: marking({ heard: "no", decision: "not_understood", feedback: "Let us try." }) });
    expect(names([missed, turn(2, { event: "provide_guidance" })])).toEqual([]);
  });

  it("notes an event that goes back to an earlier one", () => {
    expect(names([turn(1, { event: "assess_performance" }), turn(2, { event: "present_content" })])).toEqual([
      "event-out-of-order",
    ]);
  });
});
