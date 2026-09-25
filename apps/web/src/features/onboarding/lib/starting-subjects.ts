import type { GeneratedSubject } from "../types";

/** A class's real subjects come from its curriculum, so a pick before setup
    is a family, matched against the class's list by keyword. */
export const STARTING_SUBJECTS = [
  {
    id: "maths",
    label: "Mathematics",
    keywords: ["math", "algebra", "geometry", "calculus", "statistic"],
  },
  {
    id: "sciences",
    label: "Sciences",
    keywords: ["science", "biology", "chemistry", "physics"],
  },
  { id: "english", label: "English", keywords: ["english"] },
  {
    id: "computing",
    label: "ICT / CS",
    keywords: ["ict", "computer", "computing", "technology", "coding"],
  },
] as const;

export function subjectsMatching(
  id: string | undefined,
  available: readonly GeneratedSubject[],
): string[] {
  const family = STARTING_SUBJECTS.find((subject) => subject.id === id);
  if (!family) return [];
  return available
    .filter((subject) => {
      const label = subject.label.toLowerCase();
      return family.keywords.some((word) => label.includes(word));
    })
    .map((subject) => subject.id);
}
