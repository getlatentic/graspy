import type { AgeBand } from "@/lib/age-band";

export const ART_NAMES = [
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

/** One picture per subject and age band: the learner grows with the class. */
export const artUrl = (name: ArtName, band: AgeBand): string =>
  `/brand/art/${name}-${band}.webp`;
