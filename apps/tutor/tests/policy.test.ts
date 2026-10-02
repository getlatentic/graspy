import { describe, expect, it } from "vitest";
import { FIELDS, parseObservation, type Observation } from "../src/observation";
import { decide, THRESHOLD } from "../src/policy";

const none: Observation = {
  answer: null,
  communication: { dont_know: 0, repeat_request: 0, unintelligible: 0, child_question: 0, off_topic: 0 },
  physicalNeed: { toilet: 0, water: 0 },
  safety: { illness: 0, injury: 0, fear: 0, wants_grownup: 0 },
};
const seen = (change: Partial<{ [K in keyof Observation]: Partial<Observation[K]> }> & { answer?: Observation["answer"] }): Observation => ({
  ...none,
  ...change,
  communication: { ...none.communication, ...change.communication },
  physicalNeed: { ...none.physicalNeed, ...change.physicalNeed },
  safety: { ...none.safety, ...change.safety },
} as Observation);
const words = (heard: string, expected: number | null = 10) => ({ words: heard, expected });

describe("the policy decides in order, on independent judgments", () => {
  it("sends a child who is ill to a grown-up although they gave the answer", () => {
    const observation = seen({ answer: { value: 10, confidence: 0.97 }, safety: { illness: 0.94 } });
    expect(decide(observation, words("my tummy is not fine but I think it is ten"))).toEqual({ action: "needs_grownup" });
  });

  it("lets a child go who needs the toilet or water before it marks what they said", () => {
    expect(decide(seen({ answer: { value: 10, confidence: 0.9 }, physicalNeed: { water: 0.8 } }), words("ten and I am thirsty"))).toEqual({ action: "needs_help" });
    expect(decide(seen({ physicalNeed: { toilet: 0.55 } }), words("I want to go"))).toEqual({ action: "needs_help" });
  });

  it("puts safety before a need and a need before an answer", () => {
    expect(decide(seen({ safety: { fear: 0.5 }, physicalNeed: { toilet: 0.9 } }), words("someone is hitting me and I need the toilet"))).toEqual({ action: "needs_grownup" });
  });

  it("takes a lower score for a safety concern than for a need, and a higher one for a number", () => {
    expect(THRESHOLD.safety).toBeLessThan(THRESHOLD.need);
    expect(THRESHOLD.answer).toBeGreaterThan(THRESHOLD.need);
    expect(decide(seen({ safety: { illness: 0.45 } }), words("I feel funny"))).toEqual({ action: "needs_grownup" });
    expect(decide(seen({ physicalNeed: { toilet: 0.45 } }), words("I feel funny"))).toBeNull();
  });

  it("marks the number it reports only where the words could be it", () => {
    expect(decide(seen({ answer: { value: 10, confidence: 0.9 } }), words("Then"))).toEqual({ action: "mark_answer", said: 10 });
    expect(decide(seen({ answer: { value: 7, confidence: 0.99 } }), words("Lemon"))).toBeNull();
    expect(decide(seen({ answer: { value: 10, confidence: 0.4 } }), words("Then"))).toBeNull();
  });

  it("takes one word that is the answer asked for, misheard as a word for a need, for the answer", () => {
    const worried = seen({ answer: { value: 10, confidence: 0.2 }, safety: { illness: 0.9 } });
    expect(decide(worried, words("pain", 10))).toEqual({ action: "mark_answer", said: 10 });
    expect(decide(worried, words("pain", 7))).toEqual({ action: "needs_grownup" });
  });

  it("then not knowing, asking again, a question or something else, and garbled words, in that order", () => {
    expect(decide(seen({ communication: { dont_know: 0.8, repeat_request: 0.9 } }), words("I no sabi, say it again"))).toEqual({ action: "not_know" });
    expect(decide(seen({ communication: { repeat_request: 0.8, child_question: 0.9 } }), words("what"))).toEqual({ action: "repeat_question" });
    expect(decide({ ...seen({ communication: { child_question: 0.8, unintelligible: 0.9 } }), reply: "Which heap?" }, words("what is a heap"))).toEqual({ action: "answer_child", reply: "Which heap?" });
    expect(decide(seen({ communication: { unintelligible: 0.8 } }), words("Chainsaw"))).toEqual({ action: "ask_again" });
  });

  it("settles nothing where nothing is sure, which leaves the usual marking", () => {
    expect(decide(none, words("hmm"))).toBeNull();
  });
});

describe("what the model reports is checked before it is used", () => {
  it("clamps each score to 0..1, scores a field it left out as 0, and keeps a reply", () => {
    const observation = parseObservation({ answer: { value: 10, confidence: 3 }, physical_need: { toilet: -1 }, safety: { illness: "high" }, communication: { dont_know: 0.4 }, reply: "  Which heap?  " });
    expect(observation.answer).toEqual({ value: 10, confidence: 1 });
    expect([observation.physicalNeed.toilet, observation.safety.illness, observation.communication.dont_know, observation.safety.fear]).toEqual([0, 0, 0.4, 0]);
    expect(observation.reply).toBe("Which heap?");
  });

  it("scores everything 0 for a report in no shape, and an answer with no confidence as half sure", () => {
    expect(parseObservation({ communication: "yes", safety: [1] }).safety.illness).toBe(0);
    expect(parseObservation({ answer: { value: 4 } }).answer).toEqual({ value: 4, confidence: 0.5 });
  });

  it.each([[10.5], ["ten"], [-1], [2_000_000], [null], [undefined]])("leaves out an answer of %s", (value) => {
    expect(parseObservation({ answer: { value, confidence: 0.9 } }).answer).toBeNull();
  });

  it("is told one thing per field: the toilet and water only as a need, pain, harm and fear only as safety", () => {
    const naming = (group: keyof typeof FIELDS, pattern: RegExp) => Object.entries(FIELDS[group]).filter(([, what]) => pattern.test(what)).length;
    expect(naming("physicalNeed", /toilet|water|thirst/i)).toBe(2);
    expect(naming("communication", /toilet|water|thirst|ill|hurt|afraid/i)).toBe(0);
    expect(naming("safety", /toilet|water|thirst/i)).toBe(0);
  });
});
