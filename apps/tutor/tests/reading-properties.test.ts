import { describe, expect, it } from "vitest";
import { expectedReading } from "../src/reading";
import { numberWords, ordinalWords } from "../src/lines";
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
  "20 5", "100 20 3", "9.00 am", "6.30", "5.50", "2.5 kg", "5 m", "5 KG", "5 X 5", "3 x -4", "5-x", "₦5-₦3", "5kg-3kg",
  "5 - 10", "8:00 - 9:00", "1:10", "5 June", "June 5", "112", "N 500", "007", "5'6\"", "５", "５０", "3 - 2", "12 - 15",
  "3:30", "8:00", "12:45", "7:05", "1st", "2nd", "3rd", "4th", "11th", "21st", "50%", "-5%", "5kg", "5 kg", "10 cm",
  "500 ml", "₦500", "₦1,500", "5-10", "6-8", "7-3", "10-5", "1/2", "B7", "1990", "08012345678", "4471",
];
const SIGNS = [
  "+", "-", "=", "x", "×", ">", "<", "–", "−", "÷", "*", "^", "≥", "%", "₦", "&", "/", ":", "'", '"', "°", "²", "½", "→", "∙", "·",
  "✕", "＋", "＝", "：", "#", "$", "~", "(", ")",
];
const WORDS = [
  "Well done!", "Count", "ages", "and", "is", "the", "oh", "Add", "You said", "Try", "of", "more", "pages", "from", "to", "call",
  "dial", "at", "by", "between", "class", "grid", "am", "pm", "June", "ratio", "mix", "kg", "cm", "may",
];
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
const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
  "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "hundred", "thousand", "million",
];

describe.each([20260929, 7, 42, 2026, 99991])("a line the check reads is never accepted when a word of its reading is dropped or a number changed (seed %i)", (seed) => {
  const next = random(seed);
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

  it("rejects the raw reading with any one apostrophe, quote, bracket, colon, comma or hyphen that is not joining letters removed", () => {
    const accepted: string[] = [];
    for (const { text, reading } of readable) {
      for (let at = 0; at < reading.length; at++) {
        const char = reading[at];
        if (!/[.,!?;:'"()-]/.test(char)) continue;
        if (char === "-" && /\p{L}/u.test(reading[at - 1] ?? "") && /\p{L}/u.test(reading[at + 1] ?? "")) continue;
        const cut = reading.slice(0, at) + reading.slice(at + 1);
        if (verdictOf(text, cut) === "pass") accepted.push(`${text} | reading: ${reading} | accepted without ${JSON.stringify(char)} at ${at}`);
      }
    }
    expect(accepted.slice(0, 20)).toEqual([]);
  });

  it("rejects the reading with any one word swapped for another of its kind", () => {
    const accepted: string[] = [];
    const kinds = [NUMBER_WORDS, ["plus", "minus", "times"], ["greater", "less"], ["percent", "naira"]];
    for (const { text, reading } of readable) {
      const words = tokens(reading);
      for (let at = 0; at < words.length; at++) {
        const kind = kinds.find((group) => group.includes(words[at].toLowerCase()));
        if (!kind) continue;
        for (const other of kind) {
          if (other === words[at].toLowerCase()) continue;
          const changed = words.map((word, i) => (i === at ? other : word)).join(" ");
          if (verdictOf(text, changed) === "pass") accepted.push(`${text} | reading: ${reading} | accepted with ${words[at]} as ${other}`);
        }
      }
    }
    expect(accepted.slice(0, 20)).toEqual([]);
  });

  it("swaps of two neighbouring different words are rejected", () => {
    const accepted: string[] = [];
    for (const { text, reading } of readable) {
      const words = tokens(reading);
      for (let at = 0; at + 1 < words.length; at++) {
        if (words[at] === words[at + 1]) continue;
        const swapped = [...words];
        [swapped[at], swapped[at + 1]] = [swapped[at + 1], swapped[at]];
        if (verdictOf(text, swapped.join(" ")) === "pass") accepted.push(`${text} | reading: ${reading} | accepted swapping ${words[at]} and ${words[at + 1]}`);
      }
    }
    expect(accepted.slice(0, 20)).toEqual([]);
  });

  it("only ever speaks words a number, sign or unit can make, or words that were in the line", () => {
    const made = new Set<string>(["point", "percent", "naira", "plus", "minus", "times", "equals", "greater", "than", "less", "to", "o", "clock", "oh", "s", "t"]);
    for (let n = 0; n < 1000; n++) for (const word of tokens(numberWords(n))) made.add(word);
    for (const word of ["thousand", "million"]) made.add(word);
    for (let n = 1; n < 100; n++) for (const word of tokens(ordinalWords(n))) made.add(word);
    for (const word of ["kilograms", "grams", "millimetres", "centimetres", "kilometres", "millilitres"]) made.add(word);
    for (const { text, reading } of readable) {
      const inLine = new Set(tokens(text.toLowerCase()));
      for (const word of tokens(reading.toLowerCase())) {
        if (!/\p{L}/u.test(word)) continue;
        expect(made.has(word) || inLine.has(word), `${text} -> ${reading}: ${word}`).toBe(true);
      }
    }
  });
});
