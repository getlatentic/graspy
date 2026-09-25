import { currentAccount } from "@/lib/account/account-store";
import { getCurriculum } from "@/lib/curriculum-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { changePlanRecord } from "@/lib/learner-record";
import { syncPlan } from "@/lib/plan-sync";
import { pathsOf, withPathsFrom } from "./curriculum-edit";

// A signed-in device without a plan takes the account's, rather than making a new one
// that would replace it.
function accountPlan(): Promise<CurriculumData | null> {
  return syncPlan().catch((err: unknown) => {
    console.warn("Reading the account's plan failed:", err);
    return null;
  });
}

export async function loadSavedPlan(): Promise<CurriculumData | null> {
  const saved = await getCurriculum();
  // An account's record is shared: another device may have moved it to a newer plan
  // than this one, whose record plan_kept would drop.
  if (currentAccount()) return saved ?? accountPlan();
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
