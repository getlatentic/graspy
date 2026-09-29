import { describe, expect, it } from "vitest";
import { expectedReading } from "../src/reading";
import { verdictOf } from "../src/spell";

// A seeded generator, so a failure can be reproduced.
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUMBERS = [
  "0", "1", "2", "5", "7", "9", "10", "12", "13", "19", "20", "21", "45", "56", "99", "100", "101", "120", "200", "999",
  "1,000", "1,200", "12,500", "200,000,000", "2.5", "0.5", "3.14", "10.25", "-5", "-2.5", "-100",
  "3:30", "8:00", "12:45", "7:05", "1st", "2nd", "3rd", "4th", "11th", "21st", "50%", "-5%", "5kg", "5 kg", "10 cm",
  "500 ml", "₦500", "₦1,500", "5-10", "6-8", "7-3", "10-5", "1/2", "B7", "1990", "08012345678", "4471",
];
const SIGNS = ["+", "-", "=", "x", "×", ">", "<", "–", "−", "÷", "*", "^", "≥", "%", "₦", "&"];
const WORDS = ["Well done!", "Count", "ages", "and", "is", "the", "oh", "Add", "You said", "Try", "of", "more", "pages", "from", "to"];
const MARKS = [".", "!", "?", ","];

function line(next: () => number): string {
  const pick = <T,>(items: T[]) => items[Math.floor(next() * items.length)];
  const parts: string[] = [];
  const count = 2 + Math.floor(next() * 6);
  for (let i = 0; i < count; i++) {
    const roll = next();
    parts.push(roll < 0.45 ? pick(NUMBERS) : roll < 0.7 ? pick(WORDS) : roll < 0.9 ? pick(SIGNS) : pick(MARKS));
  }
  return parts.join(next() < 0.5 ? " " : "").replace(/\s+([.!?,])/g, "$1");
}

// A hyphen between letters joins words, as the check reads it; every other symbol is a token of its own.
const tokens = (text: string) => text.replace(/(?<=\p{L})-(?=\p{L})/gu, " ").match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "twenty", "thirty", "hundred", "thousand"];

describe("a line the check reads is never accepted when a word of its reading is dropped or a number changed", () => {
  const next = random(20260929);
  const lines = Array.from({ length: 6000 }, () => line(next));
  const readable = lines.map((text) => ({ text, reading: expectedReading(text) })).filter((row): row is { text: string; reading: string } => row.reading !== null);

  it("reads enough of the generated lines to mean something", () => {
    expect(readable.length).toBeGreaterThan(300);
  });

  it("has no digit or symbol left in any reading", () => {
    for (const { text, reading } of readable) expect(reading, text).not.toMatch(/\d|[%₦$£€=<>+×÷−±&°*^√≤≥≠≈#@~|\\]/u);
  });

  it("accepts the reading itself", () => {
    for (const { text, reading } of readable) expect(verdictOf(text, reading), text).toBe("pass");
  });

  it("rejects the reading with any one word or symbol dropped", () => {
    const accepted: string[] = [];
    for (const { text, reading } of readable) {
      const words = tokens(reading);
      for (let at = 0; at < words.length; at++) {
        const dropped = words.filter((_, i) => i !== at).join(" ");
        if (verdictOf(text, dropped) === "pass") accepted.push(`${text} | reading: ${reading} | accepted without: ${words[at]}`);
      }
    }
    expect(accepted.slice(0, 20)).toEqual([]);
  });

  it("rejects the reading with any one number word changed to another", () => {
    const accepted: string[] = [];
    for (const { text, reading } of readable) {
      const words = tokens(reading);
      for (let at = 0; at < words.length; at++) {
        const index = NUMBER_WORDS.indexOf(words[at].toLowerCase());
        if (index < 0) continue;
        const changed = words.map((word, i) => (i === at ? NUMBER_WORDS[(index + 1) % NUMBER_WORDS.length] : word)).join(" ");
        if (verdictOf(text, changed) === "pass") accepted.push(`${text} | reading: ${reading} | accepted with ${words[at]} as ${NUMBER_WORDS[(index + 1) % NUMBER_WORDS.length]}`);
      }
    }
    expect(accepted.slice(0, 20)).toEqual([]);
  });
});
