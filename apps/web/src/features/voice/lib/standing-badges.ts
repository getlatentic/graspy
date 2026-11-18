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

/** Where the badge for a standing is served from. */
export const badgeFor = (standing: Standing): string =>
  FILES[`/src/assets/badges/${NAME[standing]}.webp`];
