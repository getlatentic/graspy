import type { CurriculumData } from "./curriculum-record";
import { schoolSystems } from "./education-api";
import { isAfterSchool, schoolDescriptor } from "./learner-level";
import { countryCodeOf, type PlanDetails } from "./plan-details";

type PlanLevel = Required<
  Pick<PlanDetails, "system" | "level" | "levelNames" | "course">
>;

const AFTER_SCHOOL_GRADE = /^(Undergraduate|Graduate) student, studying (.+)$/;

/** Reads back what afterSchoolDescriptor wrote. */
function afterSchoolLevel(gradeLevel: string): PlanLevel | null {
  const [, who, course] = AFTER_SCHOOL_GRADE.exec(gradeLevel) ?? [];
  const level = who?.toLowerCase() ?? "";
  if (!isAfterSchool(level)) return null;
  return { system: "", level, levelNames: null, course };
}

/** Finds the class whose schoolDescriptor the plan's gradeLevel is. */
async function schoolLevel(
  gradeLevel: string,
  country: string,
): Promise<PlanLevel | null> {
  for (const system of await schoolSystems(country)) {
    const level = system.levels.find(
      (candidate) => schoolDescriptor(system, candidate) === gradeLevel,
    );
    if (level) {
      return {
        system: system.id,
        level: level.id,
        levelNames: level.name,
        course: "",
      };
    }
  }
  return null;
}

async function levelOf(plan: CurriculumData): Promise<PlanLevel | null> {
  const country = countryCodeOf(plan);
  try {
    return (
      afterSchoolLevel(plan.gradeLevel) ??
      (country ? await schoolLevel(plan.gradeLevel, country) : null)
    );
  } catch (error) {
    console.warn("Finding the plan's class in the catalogue failed:", error);
    return null;
  }
}

/** A plan from an earlier version keeps its class only as gradeLevel: this finds the
 * level fields it was written from, and leaves the plan as it is when none match. */
export async function withRecoveredLevel(
  plan: CurriculumData,
): Promise<CurriculumData> {
  if (plan.level !== undefined) return plan;
  const level = await levelOf(plan);
  return level ? { ...plan, ...level } : plan;
}
