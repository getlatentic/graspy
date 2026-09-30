import { COUNTRY_LANGUAGES } from "./country-languages";

export interface Country {
  code: string;
  languages: string[];
}

export const SUPPORTED_LANGUAGES = [
  "ar",
  "en",
  "fr",
  "es",
  "yo",
  "pcm",
  "ha",
  "ig",
  "ps",
  "fa",
  "so",
  "sw",
  "am",
  "ku",
  "ur",
  "bn",
  "pt",
  "hi",
  "zh",
  "ru",
  "de",
  "it",
  "ja",
] as const;

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const isSupportedLanguage = (code: string): code is SupportedLanguage =>
  (SUPPORTED_LANGUAGES as readonly string[]).includes(code);

/**
 * The languages a learner can choose. The rest of SUPPORTED_LANGUAGES stay in the code and are not offered
 * until each has voice lessons that work.
 */
export const OFFERED_LANGUAGES: readonly SupportedLanguage[] = ["en"];

export const isOfferedLanguage = (code: string): boolean =>
  (OFFERED_LANGUAGES as readonly string[]).includes(code);

/** The first of a country's languages that is offered, or English. */
export const offeredLanguageIn = (codes: readonly string[]): string =>
  codes.find(isOfferedLanguage) ?? "en";

let allCountries: Country[] | undefined;

/** Sorted by English name once: sorting asks Intl for hundreds of names. */
export function getAllCountries(): Country[] {
  allCountries ??= Object.entries(COUNTRY_LANGUAGES)
    .map(([code, languages]) => ({ code, languages }))
    .sort((a, b) =>
      getCountryName(a.code).localeCompare(getCountryName(b.code)),
    );
  return allCountries;
}

function displayName(
  type: "language" | "region",
  code: string,
  displayLang: string,
): string {
  try {
    return new Intl.DisplayNames([displayLang], { type }).of(code) || code;
  } catch {
    return code;
  }
}

// Chrome ships without CLDR data for these: Intl names them by code.
const ENGLISH_NAMES: Record<string, string> = {
  pcm: "Nigerian Pidgin",
};

export function getLanguageName(languageCode: string, displayLang = "en") {
  const name = displayName("language", languageCode, displayLang);
  return name === languageCode ? (ENGLISH_NAMES[languageCode] ?? name) : name;
}

// Chrome ships without CLDR data for these, so Intl names them in English or by code.
const NATIVE_NAMES: Record<string, string> = {
  yo: "Èdè Yorùbá",
  pcm: "Naijá",
};

export const getLanguageNativeName = (languageCode: string) =>
  NATIVE_NAMES[languageCode] ??
  displayName("language", languageCode, languageCode);

const COUNTRY_NAMES: Record<string, string> = {
  OTHER: "Other",
  PS: "Palestine",
};

export const getCountryName = (countryCode: string, displayLang = "en") =>
  COUNTRY_NAMES[countryCode] ?? displayName("region", countryCode, displayLang);
