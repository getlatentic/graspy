import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAllCountries,
  getCountryName,
  getLanguageName,
  getLanguageNativeName,
  isOfferedLanguage,
  isSupportedLanguage,
  offeredLanguageIn,
} from "./locale";

afterEach(() => vi.unstubAllGlobals());

describe("locale", () => {
  it("lists every country by English name, with its languages", () => {
    const countries = getAllCountries();
    const names = countries.map((country) => getCountryName(country.code));

    expect(countries).toHaveLength(249);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(countries.find((country) => country.code === "NG")).toEqual({
      code: "NG",
      languages: ["en", "pcm", "yo", "ha", "ig"],
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

  it("names Nigerian Pidgin where Intl has no name for it", () => {
    vi.stubGlobal(
      "Intl",
      Object.assign(Object.create(Intl), {
        DisplayNames: class {
          of = (code: string) => code;
        },
      }),
    );

    expect(getLanguageName("pcm")).toBe("Nigerian Pidgin");
    expect(getLanguageNativeName("pcm")).toBe("Naijá");
    expect(getLanguageName("fr")).toBe("fr");
  });

  it("knows the languages graspy teaches in", () => {
    expect(isSupportedLanguage("yo")).toBe(true);
    expect(isSupportedLanguage("pcm")).toBe(true);
    expect(isSupportedLanguage("sk")).toBe(false);
  });

  it("offers English alone, though the code can hold the others", () => {
    expect(isOfferedLanguage("en")).toBe(true);
    for (const code of ["yo", "pcm", "fr", "ha", "ig", "ar"]) {
      expect(isSupportedLanguage(code)).toBe(true);
      expect(isOfferedLanguage(code)).toBe(false);
    }
  });

  it("takes English for a country whose own languages are not offered", () => {
    expect(offeredLanguageIn(["yo", "en"])).toBe("en");
    expect(offeredLanguageIn(["fr"])).toBe("en");
    expect(offeredLanguageIn([])).toBe("en");
  });
});
