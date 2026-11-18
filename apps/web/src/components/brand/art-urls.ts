import type { AgeBand } from "@/lib/age-band";

export const ART_NAMES = [
  "tablet",
  "math",
  "science",
  "english",
  "ict",
  "history",
  "geography",
  "music",
  "art",
  "pe",
  "agriculture",
  "business",
  "civic",
] as const;

export type ArtName = (typeof ART_NAMES)[number];

/** Pictures with one look for every age. */
const ONE_LOOK: readonly ArtName[] = ["tablet"];

/** One picture per subject and age band: the learner grows with the class. */
export const artUrl = (name: ArtName, band: AgeBand): string =>
  ONE_LOOK.includes(name)
    ? `/brand/art/${name}.webp`
    : `/brand/art/${name}-${band}.webp`;
