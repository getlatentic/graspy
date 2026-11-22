import { describe, expect, it } from "vitest";
import {
  indexByPrefix,
  letterOf,
  neighbourLetterIndex,
  typeAheadIndex,
} from "./option-jump";

const options = [
  "Afghanistan",
  "Åland Islands",
  "Albania",
  "Brazil",
  "Burundi",
  "Chad",
  "United Kingdom",
  "United States",
  "Zambia",
].map((label) => ({ value: label, label }));

describe("letterOf", () => {
  it("files an accented name under its plain letter", () => {
    expect(letterOf(options[1])).toBe("A");
    expect(letterOf({ value: "x", label: " ébène" })).toBe("E");
  });
});

describe("indexByPrefix", () => {
  it("finds the first name that starts with what was typed, from where it is told to start", () => {
    expect(indexByPrefix(options, "al", 0)).toBe(1);
    expect(indexByPrefix(options, "alb", 0)).toBe(2);
    expect(indexByPrefix(options, "b", 0)).toBe(3);
    expect(indexByPrefix(options, "b", 4)).toBe(4);
  });

  it("turns round at the end and says -1 for no name or no text", () => {
    expect(indexByPrefix(options, "a", 4)).toBe(0);
    expect(indexByPrefix(options, "q", 0)).toBe(-1);
    expect(indexByPrefix(options, "", 0)).toBe(-1);
  });

  it("reads a space and case as the search does", () => {
    expect(indexByPrefix(options, "united s", 0)).toBe(7);
    expect(indexByPrefix(options, "UNITED K", 0)).toBe(6);
  });
});

describe("typeAheadIndex", () => {
  it("follows a longer word from the top", () => {
    expect(typeAheadIndex(options, "bu", 3)).toBe(4);
  });

  it("goes through the names of one letter when it is pressed again and again", () => {
    expect(typeAheadIndex(options, "aa", 0)).toBe(1);
    expect(typeAheadIndex(options, "aa", 1)).toBe(2);
    expect(typeAheadIndex(options, "aa", 2)).toBe(0);
  });
});

describe("neighbourLetterIndex", () => {
  it("steps to the first name of the next letter, turning round after the last", () => {
    expect(neighbourLetterIndex(options, 0, 1)).toBe(3);
    expect(neighbourLetterIndex(options, 3, 1)).toBe(5);
    expect(neighbourLetterIndex(options, 8, 1)).toBe(0);
  });

  it("steps to the first name of the letter before, turning round before the first", () => {
    expect(neighbourLetterIndex(options, 5, -1)).toBe(3);
    expect(neighbourLetterIndex(options, 4, -1)).toBe(0);
    expect(neighbourLetterIndex(options, 0, -1)).toBe(8);
  });

  it("copes with an empty list and an index past the end", () => {
    expect(neighbourLetterIndex([], 0, 1)).toBe(0);
    expect(neighbourLetterIndex(options, 99, -1)).toBe(6);
  });
});
