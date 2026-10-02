import { describe, expect, it } from "vitest";
import { soundsLike } from "../src/sounds-like";

describe("words a recogniser wrote that could be a number a child said", () => {
  it("accepts the number written in the words, as digits or in English, alone or in a longer answer", () => {
    for (const [heard, n] of [["10", 10], ["ten", 10], ["Ten oranges.", 10], ["I think it is twenty two", 22], ["five and five is ten", 10], ["thirty-one", 31]] as const) {
      expect(soundsLike(heard, n), `${heard} ${n}`).toBe(true);
    }
  });

  it("accepts a word a recogniser writes for a number it sounds like, with no table of them", () => {
    for (const [heard, n] of [["Tim", 10], ["Then", 10], ["tin", 10], ["Teen", 10], ["Nein", 9], ["free", 3], ["tree", 3], ["Aid", 8], ["fife", 5], ["sicks", 6], ["seben", 7], ["to", 2]] as const) {
      expect(soundsLike(heard, n), `${heard} ${n}`).toBe(true);
    }
  });

  it("refuses a number the words are not and do not sound like, which is what a model invents from noise", () => {
    for (const [heard, n] of [["To recent", 20], ["Jin", 9], ["Chainsaw", 20], ["I want football", 5], ["eleven", 10], ["Premisetina", 3], ["", 4]] as const) {
      expect(soundsLike(heard, n), `${heard} ${n}`).toBe(false);
    }
  });
});
