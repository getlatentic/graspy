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

/** The widths of the small copies beside each picture (scripts/make-art-sizes.mjs); the picture itself is 640 wide. */
export const ART_SMALL_WIDTHS = [160, 320] as const;
const ART_WIDTH = 640;

/** The picture's `srcset`: its small copies and the full picture. */
export const artSrcSet = (name: ArtName, band: AgeBand): string =>
  [
    ...ART_SMALL_WIDTHS.map(
      (width) => `/brand/art/${name}-${band}-${width}.webp ${width}w`,
    ),
    `${artUrl(name, band)} ${ART_WIDTH}w`,
  ].join(", ");
