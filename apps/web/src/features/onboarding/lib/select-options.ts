import type { CSSProperties } from "react";

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  /** Other names it is found by, such as "JS1" for "JSS 1". */
  keywords?: string[];
}

/** A name as it is searched: "JS 2", "js2" and "J.S. 2" are one name. */
const searchable = (name: string) =>
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

// With less room than this below the input, the list opens upward if there
// is more room above.
const ROOM_BELOW = 400;
const GAP = 4;

export function anchoredStyle(
  rect: Pick<DOMRect, "top" | "bottom" | "left" | "width">,
  viewportHeight: number,
): CSSProperties {
  const spaceBelow = viewportHeight - rect.bottom;
  const position = "fixed";
  const { left, width } = rect;
  return spaceBelow < ROOM_BELOW && rect.top > spaceBelow
    ? {
        position,
        left,
        width,
        top: rect.top - GAP,
        transform: "translateY(-100%)",
      }
    : { position, left, width, top: rect.bottom + GAP };
}
