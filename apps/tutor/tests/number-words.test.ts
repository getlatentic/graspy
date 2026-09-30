import { describe, expect, it } from "vitest";
import { numberWords } from "../src/lines";
import { spokenNumber } from "../src/mark";

describe("numberWords across the whole range it writes", () => {
  it("is read back as the same number by the parser that marks a child's answer", () => {
    const wrong: number[] = [];
    for (let n = 0; n <= 9999; n += 1) {
      if (spokenNumber(numberWords(n)) !== n) wrong.push(n);
    }
    expect(wrong).toEqual([]);
  });

  it("writes only letters, spaces and hyphens, so no digit is left in a line", () => {
    for (let n = 0; n <= 9999; n += 1) expect(numberWords(n)).toMatch(/^[a-z -]+$/);
    expect(numberWords(999_999_999)).toMatch(/^[a-z -]+$/);
  });
});
