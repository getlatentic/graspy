import { describe, expect, it } from "vitest";

import { dayGreeting } from "./dayGreeting";

describe("dayGreeting", () => {
  it("greets the morning until noon", () => {
    expect(dayGreeting(0)).toBe("Good morning");
    expect(dayGreeting(11)).toBe("Good morning");
  });

  it("turns over at noon, not after it", () => {
    expect(dayGreeting(12)).toBe("Good afternoon");
  });

  it("keeps the afternoon to the end of the school day", () => {
    expect(dayGreeting(16)).toBe("Good afternoon");
    expect(dayGreeting(17)).toBe("Good evening");
  });

  it("greets the evening to midnight", () => {
    expect(dayGreeting(23)).toBe("Good evening");
  });
});
