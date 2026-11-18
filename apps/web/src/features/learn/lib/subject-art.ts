import type { ArtName } from "@/components/brand/art";

// Generated subject names are an open set, so patterns decide, first match
// wins ("Computer Science" is ICT, "Agricultural Science" is agriculture); a
// subject with no picture shows its icon.
const ART: Array<[RegExp, ArtName]> = [
  [/\bict\b|computer|technology|coding/, "ict"],
  [/agric|farming|crop/, "agriculture"],
  [/math|algebra|geometry|statistic|arithmetic|calculus/, "math"],
  [/econom|commerce|business|account|financ/, "business"],
  [/chemistry|science|physics|biology/, "science"],
  [/english|literature|reading|language|grammar/, "english"],
  [/history|heritage/, "history"],
  [/geograph|social studies/, "geography"],
  [/music/, "music"],
  [/\bart\b|\barts\b|design|craft|paint|drawing/, "art"],
  [/physical|sport|\bpe\b|games/, "pe"],
  [/civic|government|citizen|moral/, "civic"],
];

export function subjectArt(name: string): ArtName | null {
  const key = name.toLowerCase();
  return ART.find(([pattern]) => pattern.test(key))?.[1] ?? null;
}
