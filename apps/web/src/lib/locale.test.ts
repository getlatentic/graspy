import { describe, expect, it } from "vitest";
import {
  getAllCountries,
  getCountryName,
  getLanguageName,
  getLanguageNativeName,
  isSupportedLanguage,
} from "./locale";

describe("locale", () => {
  it("lists every country by English name, with its languages", () => {
    const countries = getAllCountries();
    const names = countries.map((country) => getCountryName(country.code));

    expect(countries).toHaveLength(249);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(countries.find((country) => country.code === "NG")).toEqual({
      code: "NG",
      languages: ["en", "yo", "ha", "ig"],
    });
  });

  it("names Palestine as learners there name it", () => {
    expect(getCountryName("PS")).toBe("Palestine");
    expect(getCountryName("DE", "fr")).toBe("Allemagne");
  });

  it("names Yoruba in Yoruba where Intl has no name for it", () => {
    expect(getLanguageName("yo")).toBe("Yoruba");
    expect(getLanguageNativeName("yo")).toBe("Èdè Yorùbá");
    expect(getLanguageNativeName("fr")).toBe("français");
  });

  it("knows the languages graspy teaches in", () => {
    expect(isSupportedLanguage("yo")).toBe(true);
    expect(isSupportedLanguage("sk")).toBe(false);
  });
});
