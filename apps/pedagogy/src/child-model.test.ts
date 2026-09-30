import { describe, expect, it } from "vitest";
import { childMessages, parseChildTurn } from "./child-model.ts";
import { personaNamed } from "./personas.ts";

describe("parseChildTurn", () => {
  it("reads the words, correctness and note", () => {
    expect(parseChildTurn('{"say":"fifty six","isRight":true,"note":"knows it"}')).toEqual({
      said: "fifty six",
      isRight: true,
      note: "knows it",
    });
  });

  it("finds the JSON inside surrounding text", () => {
    expect(parseChildTurn('Sure: {"say":null,"isRight":null,"note":"shy"} done').said).toBeNull();
  });

  it("treats blank words as silence", () => {
    expect(parseChildTurn('{"say":"  ","isRight":null,"note":""}').said).toBeNull();
  });

  it("refuses a reply with no JSON", () => {
    expect(() => parseChildTurn("no idea")).toThrow(/no JSON/);
  });
});

describe("childMessages", () => {
  const prompt = {
    teacherSays: "What is seven times eight?",
    teacherShows: "7 × 8",
    learnerClass: "primary_4",
    history: [
      { teacherSaid: "Say it with me.", childSaid: null, teacherReplied: "Let us try again." },
    ],
  };

  it("gives the persona as the role and the question last", () => {
    const [system, user] = childMessages(personaNamed("unsure"), prompt);
    expect(system.content).toContain("not sure of this material");
    expect(system.content).toContain("primary 4");
    expect(user.content).toContain("You: (stayed silent)");
    expect(user.content).toContain("Teacher then said: Let us try again.");
    expect(user.content.endsWith("What do you say?")).toBe(true);
    expect(user.content).toContain("On the screen: 7 × 8");
  });

  it("keeps only the latest turns", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      teacherSaid: `line ${i}`,
      childSaid: "ok",
      teacherReplied: null,
    }));
    const [, user] = childMessages(personaNamed("sure"), { ...prompt, history });
    expect(user.content).not.toContain("line 3");
    expect(user.content).toContain("line 9");
  });
});

describe("personaNamed", () => {
  it("names the choices when the persona is unknown", () => {
    expect(() => personaNamed("loud")).toThrow(/sure, unsure/);
  });
});
