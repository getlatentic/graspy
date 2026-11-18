import type { ArtName } from "@/components/brand/art";

// Generated subject names are an open set, so patterns decide, first match
// wins ("Computer Science" is ICT); a subject with no picture shows its icon.
const ART: Array<[RegExp, ArtName]> = [
  [/\bict\b|computer|technology|coding/, "ict"],
  [/math|algebra|geometry|statistic|arithmetic|calculus/, "math"],
  [/chemistry|science|physics|biology/, "science"],
  [/english|literature|reading|language|grammar/, "english"],
];

export function subjectArt(name: string): ArtName | null {
  const key = name.toLowerCase();
  return ART.find(([pattern]) => pattern.test(key))?.[1] ?? null;
}
