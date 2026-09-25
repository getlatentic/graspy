import type { ThreadScope } from "@/lib/chat-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { subjectOf } from "./chat-targets";
import type { Translate } from "@/lib/i18n-context";

export function describeScope(
  scope: ThreadScope,
  curriculum: CurriculumData | null,
  t: Translate,
): { title: string; subject: string | null } {
  if (scope.kind === "topic" || scope.kind === "subject") {
    const subject =
      subjectOf(curriculum, scope.subjectSlug)?.name ?? scope.subjectSlug;
    return {
      title: scope.kind === "topic" ? scope.topic : subject,
      subject,
    };
  }
  return {
    title: t(scope.kind === "general" ? "ask.anything" : "ask.earlier"),
    subject: null,
  };
}

export function scopeDetail(
  scope: ThreadScope,
  subject: string | null,
  grade: string | null,
  t: Translate,
): string {
  if (scope.kind === "topic" || scope.kind === "subject") {
    const first = scope.kind === "topic" ? subject : t("ask.wholeSubject");
    return [first, grade].filter(Boolean).join(" · ");
  }
  return t(
    scope.kind === "general" ? "ask.anythingDetail" : "ask.earlierDetail",
  );
}
