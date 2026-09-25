import { getCurriculum } from "@/lib/curriculum-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { changePlanRecord } from "@/lib/learner-record";
import { pathsOf, withPathsFrom } from "./curriculum-edit";

export async function loadSavedPlan(): Promise<CurriculumData | null> {
  const saved = await getCurriculum();
  if (!saved) return null;
  changePlanRecord({ kind: "plan_kept", planId: saved.planId }).catch((err) =>
    console.warn("Dropping an earlier plan's record failed:", err),
  );
  return saved;
}

/** Paths are not school subjects, so they and their record move into the rebuilt plan. */
export async function carryPaths(
  previous: CurriculumData,
  rebuilt: CurriculumData,
): Promise<CurriculumData | null> {
  const carried = pathsOf(previous).filter(
    (path) => !rebuilt.subjects.some((other) => other.name === path.name),
  );
  await changePlanRecord({
    kind: "subjects_carried",
    fromPlan: previous.planId,
    toPlan: rebuilt.planId,
    subjectSlugs: carried.map((subject) => subject.slug),
  })
    .then(() => changePlanRecord({ kind: "plan_kept", planId: rebuilt.planId }))
    .catch((err) =>
      console.warn("Moving the record into the new plan failed:", err),
    );
  return carried.length > 0 ? withPathsFrom(rebuilt, previous) : null;
}
