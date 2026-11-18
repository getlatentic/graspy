import type { ArtName } from "@/components/brand/art";

// Generated subject names are an open set, so keywords decide; a subject
// with no picture shows its icon.
const ART: Array<[readonly string[], ArtName]> = [
  [["computer", "ict", "technology", "coding"], "ict"],
  [
    ["math", "algebra", "geometry", "statistic", "arithmetic", "calculus"],
    "math",
  ],
  [["chemistry", "science", "physics", "biology"], "science"],
  [["english", "literature", "reading", "language", "grammar"], "english"],
];

export function subjectArt(name: string): ArtName | null {
  const key = name.toLowerCase();
  return ART.find(([words]) => words.some((w) => key.includes(w)))?.[1] ?? null;
}
