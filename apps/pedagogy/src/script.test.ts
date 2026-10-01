import { describe, expect, it } from "vitest";
import { learnerLevel, lessonScript, planFacts, type PlanFacts } from "./script.ts";
import type { Run, Turn } from "./turn-log.ts";

const turn = (index: number, planId: string, says: string, over: Partial<Turn> = {}): Turn => ({
  index,
  move: { kind: "event", planId, eventId: "e", promptId: null, event: "elicit_performance", says, shows: null, asksForAnswer: true, reason: null },
  child: null, answerAudio: null, marking: null, replyWaitMs: null, pageNote: null, screenshots: [], ...over,
});

const FACTS: Record<string, PlanFacts> = {
  "mathematics.number.counting-in-fives": { subject: "mathematics", topic: "number", title: "Counting in fives", term: 1, week: 3, strand: "Number and Numeration", objective: "Count in groups of fives" },
  "mathematics.number.counting-in-sevens": { subject: "mathematics", topic: "number", title: "Counting in sevens", term: null, week: null, strand: null, objective: null },
};

const run: Run = {
  id: "r", voice: { engine: "e", reference: "voice-1", pitch: 1.2 }, persona: "unsure", language: "en", learnerClass: "primary_4", plan: "mathematics.number.counting-in-fives",
  startedAt: "2026-09-30T23:23:22Z", site: "https://staging.example", finished: "rest",
  turns: [
    turn(1, "mathematics.number.counting-in-fives", "Count from one to five.", {
      child: { said: "one two three four six", isRight: false, note: "" },
      marking: { heard: "1, 2, 3, 4, 6", parsedAnswer: null, decision: "try_again", feedback: "Almost. Say it after me.", provider: "whisper", latencyMs: 500 },
    }),
    turn(2, "mathematics.number.counting-in-fives", "Count again.", { child: { said: null, isRight: null, note: "" }, pageNote: "I couldn't hear you." }),
    turn(3, "mathematics.number.counting-in-sevens", "Count in sevens."),
  ],
};

describe("lessonScript", () => {
  const text = lessonScript(run, (id) => FACTS[id] ?? null);

  it("opens with who was taught, in what, and how", () => {
    expect(text).toContain("**Learner:** Primary 4, ages 9 to 11");
    expect(text).toContain("## Counting in fives");
    expect(text).toContain("**Subject:** Mathematics");
    expect(text).toContain("**Topic:** Number (term 1, week 3)");
    expect(text).toContain("**Curriculum strand:** Number and Numeration");
    expect(text).toContain("app: https://staging.example");
    expect(text).toContain("whisper (1)");
  });

  it("gives every line said, teacher and student, in order", () => {
    const said = text.split("\n").filter((line) => /^(Teacher|Student):/.test(line));
    expect(said.map((line) => line.replace(/\s+_\[.*$/, ""))).toEqual([
      "Teacher: Count from one to five.",
      "Student: one two three four six  [heard: 1, 2, 3, 4, 6]",
      "Teacher: Almost. Say it after me.",
      "Teacher: Count again.",
      "Student: (says nothing)",
      "Teacher: (I couldn't hear you.)",
      "Teacher: Count in sevens.",
    ]);
  });

  it("starts a new heading when the lesson goes on into another", () => {
    expect(text.indexOf("## Counting in sevens")).toBeGreaterThan(text.indexOf("Teacher: Count again."));
    expect(text.match(/^## /gm)).toHaveLength(2);
  });
});

describe("learnerLevel", () => {
  it("names the class and the ages", () => {
    expect(learnerLevel("primary_2")).toBe("Primary 2, ages 6 to 8");
    expect(learnerLevel("primary_6")).toBe("Primary 6, ages 9 to 11");
    expect(learnerLevel("nursery_1")).toBe("Nursery 1, ages 3 to 5");
    expect(learnerLevel("kindergarten")).toBe("Kindergarten, ages 3 to 5");
    expect(learnerLevel("jss_1")).toBe("JSS 1, ages 11 to 14");
  });
});

describe("planFacts", () => {
  it("reads the plan the app is built from", () => {
    expect(planFacts("mathematics.number.counting-in-fives")).toMatchObject({ title: "Counting in fives", subject: "mathematics", topic: "number" });
    expect(planFacts("mathematics.number.no-such-lesson")).toBeNull();
  });
});
