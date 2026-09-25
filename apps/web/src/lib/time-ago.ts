const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60_000],
  ["month", 30 * 24 * 60 * 60_000],
  ["week", 7 * 24 * 60 * 60_000],
  ["day", 24 * 60 * 60_000],
  ["hour", 60 * 60_000],
  ["minute", 60_000],
];

/** "2 hours ago", "yesterday"; under a minute reads as "now". */
export function timeAgo(
  then: number,
  locale: string,
  now = Date.now(),
): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const elapsed = now - then;
  for (const [unit, size] of UNITS) {
    if (elapsed >= size)
      return format.format(-Math.floor(elapsed / size), unit);
  }
  return format.format(0, "second");
}
