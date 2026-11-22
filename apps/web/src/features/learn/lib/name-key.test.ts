import { describe, expect, it } from "vitest";
import { nameKey } from "./name-key";

describe("nameKey", () => {
  it("makes one name of its cases, accents, spacings and punctuation", () => {
    expect(nameKey("  Éducation   Physique, ")).toBe("education physique");
    expect(nameKey("EDUCATION physique")).toBe("education physique");
  });

  it("keeps different names apart, as the server does", () => {
    expect(nameKey("Maths")).not.toBe(nameKey("Mathematics"));
    expect(nameKey("Physics 2")).not.toBe(nameKey("Physics"));
    expect(nameKey("Quantum Physics")).not.toBe(nameKey("Physics"));
  });

  it("cuts a very long name before comparing it", () => {
    expect(nameKey("a".repeat(100_000)).length).toBe(80);
  });
});
