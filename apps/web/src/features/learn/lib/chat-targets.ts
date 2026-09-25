import type { ThreadScope } from "@/lib/chat-db";
import {
  topicsOf,
  type CurriculumData,
  type CurriculumSubject,
} from "@/lib/curriculum-record";

export type ChatTarget =
  | { kind: "topic"; subjectSlug: string; topicIndex: number }
  | { kind: "subject"; subjectSlug: string }
  | { kind: "general" }
  | { kind: "earlier" };

export const ASK_HUB = "/app/learn/ask";

export function chatPath(target: ChatTarget): string {
  if (target.kind === "topic") {
    return `${ASK_HUB}/${encodeURIComponent(target.subjectSlug)}/${target.topicIndex}`;
  }
  if (target.kind === "subject") {
    return `${ASK_HUB}/subject/${encodeURIComponent(target.subjectSlug)}`;
  }
  return `${ASK_HUB}/${target.kind}`;
}

export function subjectOf(
  curriculum: CurriculumData | null,
  slug: string,
): CurriculumSubject | null {
  return curriculum?.subjects.find((subject) => subject.slug === slug) ?? null;
}

export function scopeOf(
  target: ChatTarget,
  curriculum: CurriculumData | null,
): ThreadScope | null {
  if (target.kind === "earlier") return { kind: "earlier" };
  if (!curriculum?.planId) return null;
  if (target.kind === "general") {
    return { kind: "general", planId: curriculum.planId };
  }
  if (target.kind === "subject") {
    return subjectOf(curriculum, target.subjectSlug)
      ? {
          kind: "subject",
          planId: curriculum.planId,
          subjectSlug: target.subjectSlug,
        }
      : null;
  }
  const topic = topicsOf(curriculum, target.subjectSlug)[target.topicIndex];
  if (!subjectOf(curriculum, target.subjectSlug) || !topic) return null;
  return {
    kind: "topic",
    planId: curriculum.planId,
    subjectSlug: target.subjectSlug,
    topic,
  };
}

export function targetOf(
  scope: ThreadScope,
  curriculum: CurriculumData | null,
): ChatTarget | null {
  if (scope.kind === "earlier") return { kind: "earlier" };
  if (scope.planId !== curriculum?.planId) return null;
  if (scope.kind === "general") return { kind: "general" };
  if (!subjectOf(curriculum, scope.subjectSlug)) return null;
  if (scope.kind === "subject") {
    return { kind: "subject", subjectSlug: scope.subjectSlug };
  }
  const topicIndex = topicsOf(curriculum, scope.subjectSlug).indexOf(
    scope.topic,
  );
  return topicIndex < 0
    ? null
    : { kind: "topic", subjectSlug: scope.subjectSlug, topicIndex };
}

export function targetFromParams(params: {
  subject?: string;
  topicIndex?: string;
  subjectSlug?: string;
}): ChatTarget | null {
  if (params.subjectSlug) {
    return {
      kind: "subject",
      subjectSlug: decodeURIComponent(params.subjectSlug),
    };
  }
  const subject = params.subject ? decodeURIComponent(params.subject) : "";
  if (!params.topicIndex) {
    return subject === "general" || subject === "earlier"
      ? { kind: subject }
      : null;
  }
  const topicIndex = Number(params.topicIndex);
  return subject && Number.isInteger(topicIndex) && topicIndex >= 0
    ? { kind: "topic", subjectSlug: subject, topicIndex }
    : null;
}
