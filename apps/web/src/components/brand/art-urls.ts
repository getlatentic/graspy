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

// The page's root font size, as index.css sets it for each orientation. A rem in the page is this
// wide, but in a `sizes` attribute a rem is the browser's default 16px, so a width in rem is
// written out from the same expression.
// The floor is 1rem, the browser's own default size, which index.css writes as 100%.
export const ROOT_SIZE_LANDSCAPE = "max(1rem, min(1.0417vw, 1.8519vh))";
export const ROOT_SIZE_PORTRAIT = "max(1rem, min(1.0417vh, 1.8519vw))";

/** The width a picture is shown at from `from` rem of viewport width up: `rem` of the page's root size, or `vw` of the viewport. */
export type SizeStep = { from?: number } & ({ rem: number } | { vw: number });

const wide = (step: SizeStep, root: string): string =>
  "rem" in step ? `calc(${step.rem} * ${root})` : `${step.vw}vw`;

/**
 * The `sizes` of a picture whose width follows the page's scale. Steps run from the narrowest
 * viewport up; a breakpoint is in rem of the browser's default size, as Tailwind's are.
 */
export function artSizes(steps: SizeStep[]): string {
  const sizes: string[] = [];
  for (const step of [...steps].reverse()) {
    const min = step.from === undefined ? [] : [`(min-width: ${step.from}rem)`];
    if ("vw" in step) {
      sizes.push([...min, wide(step, "")].join(" "));
      continue;
    }
    const portrait = ["(orientation: portrait)", ...min].join(" and ");
    sizes.push(`${portrait} ${wide(step, ROOT_SIZE_PORTRAIT)}`);
    sizes.push([...min, wide(step, ROOT_SIZE_LANDSCAPE)].join(" "));
  }
  return sizes.join(", ");
}

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
