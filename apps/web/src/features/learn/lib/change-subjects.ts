import { streamCurriculum, type CurriculumRequest } from "@/lib/curriculum-api";
import type {
  CurriculumData,
  CurriculumSubject,
} from "@/lib/curriculum-record";
import { changePlanRecord } from "@/lib/learner-record";
import { normalizeSubjectList } from "@/lib/slug";
import { getUserProfile, saveUserProfile } from "@/lib/user-storage";
import { CurriculumAccumulator } from "./curriculum-accumulator";
import { subjectChange, withSubjects } from "./curriculum-edit";
import { curriculumRequest } from "./curriculum-request";

async function topicsForNewSubjects(
  request: CurriculumRequest,
  kept: CurriculumSubject[],
  added: string[],
) {
  const { subjects } = normalizeSubjectList([...kept, ...added]);
  const accumulator = new CurriculumAccumulator(subjects.slice(kept.length));
  for await (const chunk of streamCurriculum({ ...request, subjects: added })) {
    if (chunk.type === "error") throw new Error(chunk.message);
    if (chunk.type !== "status") accumulator.apply(chunk);
  }
  return { subjects: accumulator.subjects, topics: accumulator.topics };
}

/** Only new subjects get topics made; kept ones keep their progress. */
export async function changeSubjects(
  curriculum: CurriculumData,
  names: string[],
): Promise<CurriculumData> {
  const profile = getUserProfile();
  if (!profile) throw new Error("No learner profile to plan for");
  const change = subjectChange(curriculum.subjects, names);
  const added = change.added.length
    ? await topicsForNewSubjects(
        curriculumRequest(profile, change.added),
        change.kept,
        change.added,
      )
    : { subjects: [], topics: {} };
  // A record failure leaves stale topics there; the change still stands.
  await Promise.all(
    change.removed.map((subject) =>
      changePlanRecord({
        kind: "subject_dropped",
        planId: curriculum.planId,
        subjectSlug: subject.slug,
      }).catch((error) =>
        console.warn(`Dropping ${subject.slug}'s record failed:`, error),
      ),
    ),
  );
  saveUserProfile({ preferredSubjects: names });
  return withSubjects(curriculum, change.kept, added);
}
