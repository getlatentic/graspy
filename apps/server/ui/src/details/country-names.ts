/** The countries as options, by the catalogue's names, in the order of the learner's language. */
export function countryOptions(
  names: Record<string, string>,
  codes: string[],
  locale: string,
): { code: string; name: string }[] {
  const collator = new Intl.Collator([locale, "en"]);
  return codes
    .map((code) => ({ code, name: names[code] }))
    .sort((a, b) => collator.compare(a.name, b.name));
}
