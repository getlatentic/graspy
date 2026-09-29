/** A recording's length as minutes and seconds: 7 is "0:07". */
export function lengthOf(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const rest = String(whole % 60).padStart(2, "0");
  return `${Math.floor(whole / 60)}:${rest}`;
}

/** When a recording was made, in the interface's language. */
export function whenOf(milliseconds: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(milliseconds);
  } catch {
    return new Date(milliseconds).toISOString();
  }
}
