import { describe, expect, it } from "vitest";
import corpus from "./name-key-corpus.json";
import { nameKey } from "./name-key";

describe("nameKey", () => {
  it.each(corpus)(
    "makes $key of $name, as the server does",
    ({ name, key }) => {
      expect(nameKey(name)).toBe(key);
    },
  );

  it("makes one name of its cases, accents, spacings and punctuation", () => {
    expect(nameKey("Pre-calculus")).toBe(nameKey("PRECALCULUS"));
    expect(nameKey("  Éducation   Physique, ")).toBe(
      nameKey("education physique"),
    );
  });

  it("keeps different names apart", () => {
    expect(nameKey("Maths")).not.toBe(nameKey("Mathematics"));
    expect(nameKey("Physics 2")).not.toBe(nameKey("Physics"));
    expect(nameKey("Quantum Physics")).not.toBe(nameKey("Physics"));
    expect(nameKey("हिन्दी")).not.toBe(nameKey("हन्द"));
  });

  it("cuts a very long name before comparing it", () => {
    expect(nameKey("a".repeat(100_000)).length).toBe(80);
  });
});
