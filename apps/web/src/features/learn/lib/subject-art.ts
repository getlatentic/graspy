import type { ArtName } from "@/components/brand/art-urls";

// Generated subject names are an open set, so patterns decide, first match
// wins ("Agricultural Technology" is agriculture, "Computer Science" is ICT,
// "Political Science" is civic); a subject with no picture shows its icon.
const ART: Array<[RegExp, ArtName]> = [
  [/agric|farming|\bcrops?\b/, "agriculture"],
  [/\bict\b|computer|information technology|coding/, "ict"],
  [/math|algebra|geometry|statistic|arithmetic|calculus/, "math"],
  [/(?<!home )econom|commerce|business|account|financ/, "business"],
  [/civic|government|citizen|moral|political/, "civic"],
  [/chemistry|science|physics|biology/, "science"],
  [/english|literature|reading|grammar/, "english"],
  [/history|heritage/, "history"],
  [/geograph|social studies/, "geography"],
  [/music/, "music"],
  [/physical|\bsports?\b|\bpe\b|martial/, "pe"],
  [/\barts?\b|design|\bcrafts?\b|paint|drawing/, "art"],
];

export function subjectArt(name: string): ArtName | null {
  const key = name.toLowerCase();
  return ART.find(([pattern]) => pattern.test(key))?.[1] ?? null;
}
