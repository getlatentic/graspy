// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLocaleOptions } from "./use-locale-options";

vi.mock("@/lib/i18n-context", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en" }),
}));

const countries = [
  { code: "NG", languages: ["en", "pcm", "yo", "ha", "ig"] },
  { code: "SN", languages: ["fr", "wo"] },
  { code: "MR", languages: ["ar"] },
];

const codes = (selected: string, current = "") =>
  renderHook(() => useLocaleOptions(countries, undefined, selected, current)).result.current.languageOptions.map(
    (option) => option.value,
  );

describe("the languages a learner can choose", () => {
  it("are English alone, for a country that speaks others", () => {
    expect(codes("NG")).toEqual(["en"]);
  });

  it("are English alone for a country that does not speak it, and before a country is chosen", () => {
    expect(codes("SN")).toEqual(["en"]);
    expect(codes("")).toEqual(["en"]);
  });

  it("list English once for a country whose languages leave it out, with or without a plan's language", () => {
    expect(codes("MR")).toEqual(["en"]);
    expect(codes("MR", "en")).toEqual(["en"]);
    expect(codes("MR", "ar").sort()).toEqual(["ar", "en"]);
  });

  it("keep the language of a plan already made, so it can be edited", () => {
    expect(codes("NG", "yo").sort()).toEqual(["en", "yo"]);
  });
});
