import { CurriculumAccumulator } from "@/features/learn/lib/curriculum-accumulator";
import { streamCurriculum, type CurriculumRequest } from "@/lib/curriculum-api";
import { deleteCurriculum, saveCurriculum } from "@/lib/curriculum-db";
import { getCountryName, getLanguageName } from "@/lib/locale";

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

/** Replaces any plan the learner had. The server is sent English names. */
export async function generatePlan(
  request: CurriculumRequest,
): Promise<GenerationStats> {
  const country = getCountryName(request.country);
  const language = getLanguageName(request.language);
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
    country,
    countryName: country,
    language,
    languageName: language,
    gradeLevel: request.gradeLevel || "middle school",
    subjects,
    topics,
    assessment: { nextSubject: accumulator.firstSubject?.slug || null },
  });
  return {
    subjectCount: subjects.length,
    topicCount: Object.values(topics).reduce((n, list) => n + list.length, 0),
  };
}
