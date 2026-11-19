import { ageBand, type AgeBand } from "@/lib/age-band";
import type { DetailsSchema } from "../schemas/onboarding-schema";

/** The learner's band once a class is chosen, which is what tells their age; a class after school needs no age. */
export function chosenBand(
  values: Pick<DetailsSchema, "level" | "school">,
): AgeBand | null {
  if (!values.level) return null;
  return ageBand({
    level: values.level,
    gradeLevel: values.school?.descriptor ?? "",
  });
}
