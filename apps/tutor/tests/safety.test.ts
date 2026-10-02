import { describe, expect, it } from "vitest";
import { needFor } from "../src/safety";

describe("what a child's words ask for", () => {
  it.each([
    ["I feel sick and I think it is ten", "needs_grownup"],
    ["I am ill, ten", "needs_grownup"],
    ["my leg is aching, ten", "needs_grownup"],
    ["I have a fever", "needs_grownup"],
    ["somebody hit me", "needs_grownup"],
    ["ten but my tummy is paining me", "needs_grownup"],
    ["I need the toilet", "needs_help"],
    ["I need to ease myself", "needs_help"],
    ["please let me go for a short call", "needs_help"],
    ["I want to drink water", "needs_help"],
    ["I am peeing myself, ten", "needs_help"],
  ])("%s is %s", (heard, need) => expect(needFor(heard)).toBe(need));

  it.each([
    "ten",
    "I'll say ten",
    "one thousand ml of water",
    "ten cups of water",
    "it is the week after next",
    "seven weeks",
  ])("%s asks for nothing", (heard) => expect(needFor(heard)).toBeNull());

  it.each([
    ["pain", 10],
    ["tummy", 10],
    ["it is poo", 2],
    ["I think it is poop", 8],
    ["water", 3],
  ] as const)("%s alone is the number %i misheard, not a need", (heard, answer) => expect(needFor(heard, answer)).toBeNull());

  it("is a need where the lone word is not the number asked for", () => {
    expect(needFor("pain", 7)).toBe("needs_grownup");
    expect(needFor("pain")).toBe("needs_grownup");
    expect(needFor("sick", 6)).toBe("needs_grownup");
  });

  it("leaves the recogniser's word for six alone", () => {
    expect(needFor("sicks", 6)).toBeNull();
    expect(needFor("fifty sicks", 56)).toBeNull();
  });

  it("is a need once anything else is said around such a word", () => {
    expect(needFor("my tummy", 10)).toBe("needs_grownup");
    expect(needFor("I feel sick", 6)).toBe("needs_grownup");
    expect(needFor("I need water", 3)).toBe("needs_help");
  });
});
