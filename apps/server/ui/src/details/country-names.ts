/** A country's name from its code, in a language; the code itself where the runtime has no name. */
export function countryName(code: string, locale: string): string {
  try {
    return (
      new Intl.DisplayNames([locale, "en"], { type: "region" }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

/** The countries as options, by name in the learner's language. */
export function countryOptions(
  codes: string[],
  locale: string,
): { code: string; name: string }[] {
  const collator = new Intl.Collator([locale, "en"]);
  return codes
    .map((code) => ({ code, name: countryName(code, locale) }))
    .sort((a, b) => collator.compare(a.name, b.name));
}
