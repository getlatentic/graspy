import type { Help } from "@/lib/content";

/** What a check has been given so far: the wrong options chosen at it, and the help that followed the last. */
export interface HelpState {
  tried: number[];
  given?: "cue" | "narrow";
  /** The options left to choose from once the server has narrowed the question. */
  keep?: number[];
}

export const NO_HELP: HelpState = { tried: [] };

/** The state after a wrong `chosen` was answered with `help`. */
export function afterHelp(
  state: HelpState,
  chosen: number,
  help: Help,
): HelpState {
  return {
    tried: [...state.tried, chosen],
    given: help.kind === "narrow" ? "narrow" : "cue",
    keep: help.keep.length > 0 ? help.keep : state.keep,
  };
}

/** The options that can no longer be chosen: the wrong ones tried, and those the question was narrowed past. */
export function struckOf(
  state: HelpState,
  optionCount: number,
): ReadonlySet<number> {
  const struck = new Set(state.tried);
  for (let index = 0; index < optionCount; index += 1) {
    if (state.keep && !state.keep.includes(index)) struck.add(index);
  }
  return struck;
}
