import { describe, expect, it } from "vitest";
import { toMarking, toMove } from "./observer.ts";

describe("toMove", () => {
  const wire = {
    kind: "event" as const,
    plan_id: "p",
    event_id: "e",
    event: "elicit_performance",
    say: "plan.p.e",
    say_text: { en: "What is seven times eight?", yo: "Kí ni?" },
    show: { en: "7 × 8" },
    activity: { kind: "existing", prompt_id: "x" },
  };

  it("takes the lesson language's words and notes that it asks for an answer", () => {
    expect(toMove(wire, "yo")).toMatchObject({ says: "Kí ni?", shows: "7 × 8", asksForAnswer: true });
  });

  it("falls back to English and to the line's id", () => {
    expect(toMove(wire, "pcm").says).toBe("What is seven times eight?");
    expect(toMove({ ...wire, say_text: undefined }, "en").says).toBe("plan.p.e");
  });

  it("marks a taught line as asking nothing", () => {
    expect(toMove({ ...wire, activity: null }, "en").asksForAnswer).toBe(false);
  });
});

describe("toMarking", () => {
  it("renames the wire's fields", () => {
    expect(
      toMarking({ transcript: "fifty six", parsed_answer: 56, decision: "correct", feedback: "Well done", provider: "intron", latency_ms: 900 }),
    ).toEqual({ heard: "fifty six", parsedAnswer: 56, decision: "correct", feedback: "Well done", provider: "intron", latencyMs: 900, at: expect.any(Number) });
  });
});
