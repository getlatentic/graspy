import { CurriculumAccumulator } from "@/features/learn/lib/curriculum-accumulator";
import { streamCurriculum, type CurriculumRequest } from "@/lib/curriculum-api";
import { deleteCurriculum, saveCurriculum } from "@/lib/curriculum-db";
import { planDetails } from "@/lib/plan-details";
import type { LearnerDetails } from "@/lib/user-storage";

/** The plan asked for, and the learner it is for. */
export interface PlanOrder {
  request: CurriculumRequest;
  learner: LearnerDetails;
}

export interface GenerationStats {
  subjectCount: number;
  topicCount: number;
}

/** Returns the last error the stream sent. */
async function followStream(
  request: CurriculumRequest,
  accumulator: CurriculumAccumulator,
): Promise<string | undefined> {
  let failure: string | undefined;
  for await (const event of streamCurriculum(request)) {
    if (event.type === "error") failure = event.message;
    else if (event.type !== "status") accumulator.apply(event);
  }
  return failure;
}

/** The plan of a class that learns by voice alone: who it is for, which the learner's
 * devices share, and no subjects, so the model is not asked. Replaces any plan they had. */
export async function keepVoiceOnlyPlan(
  learner: LearnerDetails,
): Promise<void> {
  await saveCurriculum({
    ...planDetails(learner),
    subjects: [],
    topics: {},
    assessment: { nextSubject: null },
  });
}

/** Replaces any plan the learner had. The server is sent English names. */
export async function generatePlan({
  request,
  learner,
}: PlanOrder): Promise<GenerationStats> {
  const details = planDetails(learner);
  const { country, language } = details;
  try {
    await deleteCurriculum();
  } catch (e) {
    console.warn("Failed to clear previous curriculum:", e);
  }

  const accumulator = new CurriculumAccumulator();
  const failure = await followStream(
    { ...request, country, language },
    accumulator,
  );
  if (failure) throw new Error(failure);

  const { subjects, topics } = accumulator;
  await saveCurriculum({
    ...details,
    gradeLevel: details.gradeLevel || "middle school",
    subjects,
    topics,
    assessment: { nextSubject: accumulator.firstSubject?.slug || null },
  });
  return {
    subjectCount: subjects.length,
    topicCount: Object.values(topics).reduce((n, list) => n + list.length, 0),
  };
}
