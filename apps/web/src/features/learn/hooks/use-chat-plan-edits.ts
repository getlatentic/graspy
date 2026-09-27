import { useMemo } from "react";
import { useNavigate, type NavigateFunction } from "react-router";
import type { TutorAction } from "@/lib/a2a/reply-data";
import type { LearningPath } from "@/lib/curriculum-api";
import type { ChatLink } from "@/lib/chat-db";
import { useI18n, type Translate } from "@/lib/i18n-context";
import { goalIndex, withPath, withTopic } from "../lib/curriculum-edit";
import { rebuildRequest } from "../lib/curriculum-request";
import { lessonPath, subjectPath } from "@/lib/learn-paths";
import type { LearnerPlan } from "./use-learner-plan";

export type ActionOf<K extends TutorAction["type"]> = Extract<
  TutorAction,
  { type: K }
>;

type PlanEditDeps = Pick<
  LearnerPlan,
  "curriculum" | "applyCurriculum" | "regenerate"
> & {
  onDone: (message: string, link?: ChatLink) => void;
};

const lessonLink = (
  t: Translate,
  subjectSlug: string,
  index: number,
): ChatLink => ({
  label: t("chat.openLesson"),
  to: lessonPath(subjectSlug, index),
});

function planEdits(
  { curriculum, applyCurriculum, regenerate, onDone }: PlanEditDeps,
  t: Translate,
  navigate: NavigateFunction,
) {
  return {
    openTopic: ({ topic, subjectSlug, topicIndex }: ActionOf<"open_topic">) =>
      onDone(
        t("chat.topicReady", { topic }),
        lessonLink(t, subjectSlug, topicIndex),
      ),
    openSubject: ({ subject, subjectSlug }: ActionOf<"open_subject">) =>
      onDone(t("chat.subjectReady", { subject }), {
        label: t("chat.openSubject"),
        to: subjectPath(subjectSlug),
      }),
    addTopic: async ({
      subjectSlug,
      subject,
      topic,
    }: ActionOf<"add_topic">) => {
      const added = curriculum && withTopic(curriculum, subjectSlug, topic);
      if (!added) return;
      await applyCurriculum(added.curriculum);
      onDone(
        t("chat.topicAdded", { topic, subject }),
        lessonLink(t, subjectSlug, added.index),
      );
    },
    acceptPath: async (path: LearningPath) => {
      if (!curriculum) return;
      const { curriculum: next, subject } = withPath(curriculum, path);
      await applyCurriculum(next);
      const goal = Math.max(0, goalIndex(next, subject.slug));
      onDone(
        t("chat.pathAdded", { subject: subject.name }),
        lessonLink(t, subject.slug, goal),
      );
    },
    rebuild: async () => {
      const request = curriculum && rebuildRequest(curriculum);
      if (!request) return;
      navigate("/app/learn");
      await regenerate(request, t);
    },
  };
}

/** Each edit is reported with a link, so the chat never navigates away itself. */
export function useChatPlanEdits({
  curriculum,
  applyCurriculum,
  regenerate,
  onDone,
}: PlanEditDeps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return useMemo(
    () =>
      planEdits(
        { curriculum, applyCurriculum, regenerate, onDone },
        t,
        navigate,
      ),
    [applyCurriculum, curriculum, navigate, onDone, regenerate, t],
  );
}
