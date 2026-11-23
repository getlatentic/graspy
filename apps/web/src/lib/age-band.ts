import { isAfterSchool } from "@/lib/learner-level";

export type AgeBand = "child" | "tween" | "teen";

/** Where the learner's pictures change from the younger look to the next. */
const TWEEN_FROM = 11;
const TEEN_FROM = 15;

/** A band from a value that may be missing or unknown: child. */
export function knownBand(band: string | null | undefined): AgeBand {
  return band === "tween" || band === "teen" ? band : "child";
}

/** The learner's age band: the age in the class's descriptor ("JSS 1, Nigeria, age 12"), or teen after school. */
export function ageBand(learner: {
  level: string;
  gradeLevel: string;
}): AgeBand {
  if (isAfterSchool(learner.level)) return "teen";
  const age = /\bage (\d{1,2})\b/.exec(learner.gradeLevel)?.[1];
  if (age === undefined) return "child";
  const years = Number(age);
  if (years >= TEEN_FROM) return "teen";
  return years >= TWEEN_FROM ? "tween" : "child";
}
