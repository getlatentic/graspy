import type { CSSProperties } from "react";

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  /** Other names it is found by, such as "JS1" for "JSS 1". */
  keywords?: string[];
}

/** A name as it is searched: "JS 2", "js2" and "J.S. 2" are one name. */
export const searchable = (name: string) =>
  name.toLowerCase().replace(/[\s.\-_/]+/g, "");

export function matchingOptions(
  options: SelectOption[],
  term: string,
): SelectOption[] {
  const query = searchable(term);
  return options.filter((option) =>
    [option.label, ...(option.keywords ?? [])].some((name) =>
      searchable(name).includes(query),
    ),
  );
}

export interface GroupedOptions {
  heading: string | undefined;
  members: { option: SelectOption; index: number }[];
}

/** Groups in the order they first appear; each option keeps its index in
    the whole list. */
export function groupOptions(options: SelectOption[]): GroupedOptions[] {
  const groups = new Map<
    string | undefined,
    { option: SelectOption; index: number }[]
  >();
  options.forEach((option, index) => {
    const members = groups.get(option.group || undefined) ?? [];
    members.push({ option, index });
    groups.set(option.group || undefined, members);
  });
  return [...groups].map(([heading, members]) => ({ heading, members }));
}

/** The list is never taller than this, in rem (the root size scales with the screen). */
export const LIST_CAP_REM = 28;
const GAP_REM = 0.25;
const EDGE_REM = 0.5;

/**
 * Where the list goes. `wanted` is its real height in px (the toolbar and every
 * row), 0 when it is not known; `rem` is the root size in px. It opens below
 * the field and flips above only when it does not fit below and there is more
 * room above; its `maxHeight` is the room it has, so the toolbar and the rows
 * scroll inside the box instead of leaving the screen.
 */
export function anchoredStyle(
  rect: Pick<DOMRect, "top" | "bottom" | "left" | "width">,
  viewportHeight: number,
  wanted = 0,
  rem = 16,
): CSSProperties {
  const gap = GAP_REM * rem;
  const room = (space: number) => Math.max(0, space - gap - EDGE_REM * rem);
  const below = room(viewportHeight - rect.bottom);
  const above = room(rect.top);
  const cap = LIST_CAP_REM * rem;
  const height = wanted > 0 ? Math.min(wanted, cap) : cap;
  const { left, width } = rect;
  const position = "fixed";
  if (height <= below || below >= above) {
    return {
      position,
      left,
      width,
      top: rect.bottom + gap,
      maxHeight: Math.min(height, below),
    };
  }
  return {
    position,
    left,
    width,
    bottom: viewportHeight - rect.top + gap,
    maxHeight: Math.min(height, above),
  };
}
