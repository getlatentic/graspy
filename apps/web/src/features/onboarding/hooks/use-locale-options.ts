import { useMemo } from "react";
import { useI18n } from "@/lib/i18n-context";
import {
  getCountryName,
  getLanguageName,
  getLanguageNativeName,
  SUPPORTED_LANGUAGES,
  type Country,
} from "@/lib/locale";
import type { SelectOption } from "../lib/select-options";

/** "Français (French)"; a name the learner reads either way appears once. */
function languageLabel(code: string, locale: string): string {
  const native = getLanguageNativeName(code);
  const known = getLanguageName(code, locale);
  return native === known ? native : `${native} (${known})`;
}

/** Values stay codes: the API is sent English names built from them. */
export function useLocaleOptions(
  allCountries: Country[],
  detectedCountry: string | undefined,
  selectedCountry: string,
) {
  const { t, locale } = useI18n();

  const countryOptions = useMemo<SelectOption[]>(() => {
    const option = (code: string, group: string) => ({
      value: code,
      label: getCountryName(code, locale),
      group,
    });
    const suggested = t("onboarding.profile.suggested");
    const all = t("onboarding.profile.allCountries");
    return [
      ...(detectedCountry ? [option(detectedCountry, suggested)] : []),
      ...allCountries
        .filter((country) => country.code !== detectedCountry)
        .map((country) => option(country.code, all)),
    ];
  }, [allCountries, detectedCountry, locale, t]);

  const languageOptions = useMemo<SelectOption[]>(() => {
    const option = (code: string, group: string) => ({
      value: code,
      label: languageLabel(code, locale),
      group,
    });
    const suggestedCodes =
      allCountries.find((country) => country.code === selectedCountry)
        ?.languages ?? [];
    const suggested = t("onboarding.profile.suggested");
    const all = t("onboarding.profile.allLanguages");
    const others = SUPPORTED_LANGUAGES.filter(
      (code) => !suggestedCodes.includes(code),
    )
      .map((code) => option(code, all))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
    return [
      ...suggestedCodes.map((code) => option(code, suggested)),
      ...others,
    ];
  }, [allCountries, selectedCountry, locale, t]);

  return { countryOptions, languageOptions };
}
