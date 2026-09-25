import type { LearnerContext } from "@/lib/a2a/client";
import type { ThreadScope } from "@/lib/chat-db";
import { topicsOf, type CurriculumData } from "@/lib/curriculum-record";
import { subjectOf } from "./chat-targets";

/** Names rather than codes, because the model reads them. */
function planContext(curriculum: CurriculumData | null): LearnerContext {
  if (!curriculum) return {};
  const { subjects } = curriculum;
  return {
    country: curriculum.countryName || curriculum.country || undefined,
    language: curriculum.languageName || curriculum.language || undefined,
    gradeLevel: curriculum.gradeLevel || undefined,
    planId: curriculum.planId || undefined,
    subjects: subjects.length
      ? subjects.map(({ name, slug }) => ({ name, slug }))
      : undefined,
  };
}

export function scopeContext(
  curriculum: CurriculumData | null,
  scope: ThreadScope,
): LearnerContext {
  const plan = planContext(curriculum);
  if (scope.kind !== "topic" && scope.kind !== "subject") return plan;
  const subject = subjectOf(curriculum, scope.subjectSlug);
  const topics = subject ? topicsOf(curriculum, subject.slug) : [];
  return {
    ...plan,
    subject: subject?.name,
    subjectSlug: subject?.slug,
    topic: scope.kind === "topic" ? scope.topic : undefined,
    topics: topics.length ? topics : undefined,
  };
}
