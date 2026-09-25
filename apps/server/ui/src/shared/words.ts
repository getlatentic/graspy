import en from "@/words/en.json";
import yo from "@/words/yo.json";
import ar from "@/words/ar.json";

export type Words = typeof en;
export type PracticeWords = Words["practice"];
export type LessonWords = Words["lesson"];

const WORDS: Record<string, Words> = { en, yo, ar };
const RTL = new Set(["ar"]);

const language = (locale: string) => locale.slice(0, 2).toLowerCase();

export function wordsFor(locale: string): Words {
  return WORDS[language(locale)] ?? en;
}

export function directionOf(locale: string): "ltr" | "rtl" {
  return RTL.has(language(locale)) ? "rtl" : "ltr";
}

export function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? values[key] : match,
  );
}
