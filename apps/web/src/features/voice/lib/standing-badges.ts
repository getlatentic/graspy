import type { Standing } from "@/lib/voice/voice-types";

const FILES = import.meta.glob<string>("/src/assets/badges/*.webp", {
  eager: true,
  import: "default",
  query: "?url",
});

const NAME: Record<Standing, string> = {
  untouched: "not-yet",
  started: "started",
  learnt: "learnt",
  mastered: "known",
};

function urlOf(standing: Standing): string {
  const url = FILES[`/src/assets/badges/${NAME[standing]}.webp`];
  if (!url)
    throw new Error(`No badge picture for ${standing}: ${NAME[standing]}.webp`);
  return url;
}

const BADGES = Object.fromEntries(
  (Object.keys(NAME) as Standing[]).map((standing) => [
    standing,
    urlOf(standing),
  ]),
) as Record<Standing, string>;

/** Where the badge for a standing is served from; a missing file stops the app at start, not on a tile. */
export const badgeFor = (standing: Standing): string => BADGES[standing];
