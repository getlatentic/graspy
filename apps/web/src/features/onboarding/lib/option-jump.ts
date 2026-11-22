import { searchable, type SelectOption } from "./select-options";

/** What the person typed is forgotten after this long without a key. */
export const TYPE_AHEAD_MS = 800;

/** How far PageUp and PageDown move in a list. */
export const PAGE_SIZE = 8;

/** A name as it is jumped to: searched as in select-options, and without accents, so "a" finds "Åland". */
const jumpable = (name: string) =>
  searchable(name).normalize("NFD").replace(/[̀-ͯ]/g, "");

/** The letter an option is filed under, as an alphabet strip would: "Åland" is under A. */
export function letterOf(option: SelectOption): string {
  const first = option.label.trim().charAt(0);
  return first.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleUpperCase();
}

/** The index of the first option from `from` on (then from the top) that starts with what was typed; -1 for none. */
export function indexByPrefix(
  options: SelectOption[],
  typed: string,
  from: number,
): number {
  const prefix = jumpable(typed);
  if (!prefix) return -1;
  const count = options.length;
  for (let step = 0; step < count; step++) {
    const index = (from + step) % count;
    if (jumpable(options[index].label).startsWith(prefix)) return index;
  }
  return -1;
}

/**
 * Where the keys typed so far lead. "ni" finds "Niger" from the top; the same
 * letter pressed again and again goes through the options that start with it.
 */
export function typeAheadIndex(
  options: SelectOption[],
  typed: string,
  highlighted: number,
): number {
  const again = typed.length > 1 && [...typed].every((c) => c === typed[0]);
  return again
    ? indexByPrefix(options, typed[0], highlighted + 1)
    : indexByPrefix(options, typed, 0);
}

function runStart(options: SelectOption[], index: number): number {
  const letter = letterOf(options[index]);
  let start = index;
  while (start > 0 && letterOf(options[start - 1]) === letter) start--;
  return start;
}

/** The first option of the next letter (`direction` 1) or of the one before it (-1), turning round at the ends. */
export function neighbourLetterIndex(
  options: SelectOption[],
  from: number,
  direction: 1 | -1,
): number {
  const count = options.length;
  if (count === 0) return 0;
  const here = Math.min(Math.max(from, 0), count - 1);
  if (direction === 1) {
    const letter = letterOf(options[here]);
    for (let i = here + 1; i < count; i++) {
      if (letterOf(options[i]) !== letter) return i;
    }
    return 0;
  }
  const start = runStart(options, here);
  return runStart(options, start === 0 ? count - 1 : start - 1);
}
