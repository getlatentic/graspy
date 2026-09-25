import { describe, expect, it } from "vitest";
import ar from "@/words/ar.json";
import en from "@/words/en.json";
import yo from "@/words/yo.json";
import { fill, wordsFor } from "./words";

const keys = (words: object): string[] =>
  Object.entries(words).flatMap(([key, value]) =>
    typeof value === "object"
      ? keys(value).map((inner) => `${key}.${inner}`)
      : [key],
  );

describe("the views' words", () => {
  it.each([
    ["yo", yo],
    ["ar", ar],
  ])("%s says everything English says", (_, words) => {
    expect(keys(words).sort()).toEqual(keys(en).sort());
  });

  it("falls back to English for a language the views do not speak", () => {
    expect(wordsFor("fr-FR")).toBe(en);
    expect(wordsFor("yo-NG")).toBe(yo);
  });

  it("fills in what it is given and leaves the rest", () => {
    expect(fill("{a} of {b}", { a: "1" })).toBe("1 of {b}");
  });
});
