import { describe, expect, it } from "vitest";
import ar from "./ar.json";
import en from "./en.json";
import pcm from "./pcm.json";
import yo from "./yo.json";

const LOCALES = { en, yo, ar, pcm } as Record<string, Record<string, unknown>>;
const TRANSLATIONS = Object.keys(LOCALES).filter((lang) => lang !== "en");

const SOURCES = import.meta.glob<string>(
  ["../**/*.{ts,tsx}", "!../**/*.test.ts"],
  { query: "?raw", import: "default", eager: true },
);

const usedKeys = [
  ...new Set(
    Object.values(SOURCES).flatMap((source) =>
      [...source.matchAll(/\bt\(\s*"([\w.]+)"/g)].map((match) => match[1]),
    ),
  ),
].sort();

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, inner]) =>
    keysOf(inner, prefix ? `${prefix}.${key}` : key),
  );
}

const messageOf = (locale: Record<string, unknown>, key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (value, part) => (value as Record<string, unknown> | undefined)?.[part],
      locale,
    );

const has = (locale: Record<string, unknown>, key: string) =>
  typeof messageOf(locale, key) === "string";

const placeholdersOf = (message: unknown) =>
  [...String(message).matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1])
    .sort()
    .join(",");

describe("translations", () => {
  it("finds the keys the code uses", () => {
    expect(usedKeys.length).toBeGreaterThan(100);
  });

  it.each(Object.keys(LOCALES))("%s has every key the code uses", (lang) => {
    expect(usedKeys.filter((key) => !has(LOCALES[lang], key))).toEqual([]);
  });

  it.each(TRANSLATIONS)("%s has the same keys as English", (lang) => {
    expect(keysOf(LOCALES[lang]).sort()).toEqual(keysOf(en).sort());
  });

  it.each(TRANSLATIONS)("%s keeps every placeholder English has", (lang) => {
    const differing = keysOf(en).filter(
      (key) =>
        has(LOCALES[lang], key) &&
        placeholdersOf(messageOf(en, key)) !==
          placeholdersOf(messageOf(LOCALES[lang], key)),
    );
    expect(differing).toEqual([]);
  });
});
