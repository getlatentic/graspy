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
    ["I wan piss", "needs_help"],
    ["I need the restroom", "needs_help"],
    ["I want to use the loo", "needs_help"],
    ["I wet myself", "needs_help"],
    ["water", "needs_help"],
    ["he is hitting me", "needs_grownup"],
    ["he pushed me", "needs_grownup"],
    ["I am not feeling well", "needs_grownup"],
    ["I can't breathe", "needs_grownup"],
  ])("%s is %s", (heard, need) => expect(needFor(heard)).toBe(need));

  it.each([
    "ten",
    "I'll say ten",
    "one thousand ml of water",
    "ten cups of water",
    "it is the week after next",
    "seven weeks",
    "five bottles of water please",
    "ten bottles of water I want ten",
    "I'm afraid it is five",
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
    expect(needFor("sick", 7)).toBe("needs_grownup");
    expect(needFor("I am sick", 6)).toBe("needs_grownup");
  });

  it("takes a lone word for the answer through the courtesy and the repeating that follow a number", () => {
    for (const heard of ["pain please", "pain sir", "pain o", "pain pain", "sick ma"]) {
      expect(needFor(heard, heard.startsWith("sick") ? 6 : 10), heard).toBeNull();
    }
  });

  it("never takes a word that is a need in every other mouth for the number", () => {
    for (const [heard, answer] of [["toilet", 20], ["bleeding", 20], ["vomit", 40], ["hurt", 90], ["scared", 70], ["thirsty", 45]] as const) {
      expect(needFor(heard, answer), heard).not.toBeNull();
    }
  });

  it("reads such a word among the numbers of a count or a table as one of them", () => {
    expect(needFor("one two three four five sick seven eight nine ten")).toBeNull();
    expect(needFor("two times three is sick")).toBeNull();
    expect(needFor("one two poo four")).toBeNull();
    expect(needFor("one two three I am hurt")).toBe("needs_grownup");
  });

  it("leaves topical words and a water word problem alone, and answers a request for water", () => {
    for (const heard of ["five snake", "a cow has four stomach", "ten blood", "five breathe", "ten people drink water", "get water ten", "ten litres of water"]) {
      expect(needFor(heard, 10), heard).toBeNull();
    }
    expect(needFor("water", 3, "How many cups of water in three jugs?")).toBeNull();
    for (const heard of ["can I have some water", "I want to drink", "I need a drink", "bring me water", "abeg water", "I wan water"]) {
      expect(needFor(heard, 10), heard).toBe("needs_help");
    }
  });

  it("answers the phrasings a child uses for being unwell, hit, or needing out", () => {
    for (const heard of ["I don't feel well", "I am not well", "I feel unwell", "I fainted", "I am choking", "toothache", "he punched me", "I was beaten", "my belly", "help me", "I want my mummy"]) {
      expect(needFor(heard, 10), heard).toBe("needs_grownup");
    }
    for (const heard of ["I want to throw up", "I wan ease", "I want to pass urine", "I need the washroom", "nature is calling", "I want to go out", "I want to do number two"]) {
      expect(needFor(heard, 10), heard).toBe("needs_help");
    }
  });

  it("leaves the recogniser's word for six alone", () => {
    expect(needFor("sicks", 6)).toBeNull();
    expect(needFor("fifty sicks", 56)).toBeNull();
  });

  it("is a need once anything else is said around such a word", () => {
    expect(needFor("my belly", 10)).toBe("needs_grownup");
    expect(needFor("I feel sick", 6)).toBe("needs_grownup");
    expect(needFor("I need water", 3)).toBe("needs_help");
  });
});
