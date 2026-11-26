import type { LearnerContext } from "@/lib/a2a/client";
import type { ThreadScope } from "@/lib/chat-db";
import { topicsOf, type CurriculumData } from "@/lib/curriculum-record";
import { detectLocale } from "@/lib/locale-detector";
import { subjectOf } from "./chat-targets";

/** The code as the server reads it: two capital letters, or none. */
function countryCodeOf(code: string | undefined): string | undefined {
  return code && /^[A-Za-z]{2}$/.test(code.trim())
    ? code.trim().toUpperCase()
    : undefined;
}

/** Names rather than codes, because the model reads them. A country is the learner's own only
 * once they have a class or a subject: before that the plan's is a guess, which goes to the
 * server as a guess (`deviceCountry`), where the form it asks starts on the country the edge
 * placed the connection in, and on this one only when the edge placed none. */
function planContext(curriculum: CurriculumData | null): LearnerContext {
  if (!curriculum) return {};
  const { subjects } = curriculum;
  const said = Boolean(curriculum.gradeLevel) || subjects.length > 0;
  const guess = countryCodeOf(
    detectLocale().country ?? curriculum.countryCode ?? undefined,
  );
  return {
    ...(said
      ? {
          country: curriculum.countryName || curriculum.country || undefined,
          countryCode: countryCodeOf(curriculum.countryCode),
        }
      : { deviceCountry: guess }),
    emptyPlan: subjects.length === 0 ? true : undefined,
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
