import { STRONG_LANGUAGE_SIGNALS } from "./strong-language-signals";
import { TIMEZONE_COUNTRY } from "./timezone-countries";

export interface DetectedLocale {
  language: string;
  country: string | null;
}

function userTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function tagRegion(tag: string | undefined): string | null {
  const region = tag?.split("-")[1];
  return region?.length === 2 ? region.toUpperCase() : null;
}

const languageCountry = (language: string): string | undefined =>
  STRONG_LANGUAGE_SIGNALS[language] ??
  STRONG_LANGUAGE_SIGNALS[language.split("-")[0]];

function detectCountry(languages: string[]): string | null {
  return (
    languages.map(languageCountry).find(Boolean) ??
    TIMEZONE_COUNTRY[userTimezone()] ??
    tagRegion(languages[0])
  );
}

export function detectLocale(): DetectedLocale {
  const tag = navigator.language || navigator.languages?.[0] || "en";
  const languages = Array.from(
    navigator.languages || [navigator.language || "en"],
  );
  return {
    language: tag.split("-")[0].toLowerCase(),
    country: detectCountry(languages),
  };
}
