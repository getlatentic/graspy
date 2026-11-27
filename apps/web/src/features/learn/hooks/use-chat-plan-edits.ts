import { useMemo } from "react";
import { useNavigate, type NavigateFunction } from "react-router";
import type { TutorAction } from "@/lib/a2a/reply-data";
import type { ChatLink, SignInOffer } from "@/lib/chat-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { useI18n, type Translate } from "@/lib/i18n-context";
import { MAX_SUBJECTS, withPaths, withTopic } from "../lib/curriculum-edit";
import { rebuildRequest } from "../lib/curriculum-request";
import { lessonPath, subjectPath } from "@/lib/learn-paths";
import type { LearnerPlan } from "./use-learner-plan";

export type ActionOf<K extends TutorAction["type"]> = Extract<
  TutorAction,
  { type: K }
>;

type PlanEditDeps = Pick<LearnerPlan, "applyCurriculum" | "regenerate"> & {
  /** The plan as it is now, after the edits made before this one. */
  read: () => CurriculumData | null;
  onDone: (message: string, link?: ChatLink, offer?: SignInOffer) => void;
  onFailure: (message: string) => void;
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
  { read, applyCurriculum, regenerate, onDone, onFailure }: PlanEditDeps,
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
      const current = read();
      const added = current && withTopic(current, subjectSlug, topic);
      if (!added) return;
      await applyCurriculum(added.curriculum);
      onDone(
        t("chat.topicAdded", { topic, subject }),
        lessonLink(t, subjectSlug, added.index),
        "keep",
      );
    },
    /** Adds the courses the learner chose topics of. Nothing leaves the chat: the lesson to open
     * is the card the tutor shows, which the learner presses. */
    addPaths: async ({ paths }: ActionOf<"add_paths">) => {
      const current = read();
      if (!current) return;
      const { curriculum: next, outcomes } = withPaths(current, paths);
      if (outcomes.some(({ status }) => status === "added")) {
        await applyCurriculum(next);
      }
      const told = new Set<string>();
      for (const outcome of outcomes) {
        if (outcome.status !== "added" && outcome.status !== "existing")
          continue;
        const { subject } = outcome;
        if (told.has(subject.slug)) continue;
        told.add(subject.slug);
        onDone(
          t(outcome.status === "added" ? "chat.pathAdded" : "chat.pathExists", {
            subject: subject.name,
          }),
          undefined,
          outcome.status === "added" ? "keep" : undefined,
        );
      }
      if (outcomes.some(({ status }) => status === "unnamed")) {
        onFailure(t("chat.pathUnnamed"));
      }
      if (outcomes.some(({ status }) => status === "full")) {
        onFailure(t("chat.pathsFull", { count: MAX_SUBJECTS }));
      }
    },
    rebuild: async () => {
      const current = read();
      const request = current && rebuildRequest(current);
      if (!request) return;
      navigate("/app/learn");
      await regenerate(request, t);
    },
  };
}

/** Each edit is reported with a link, so the chat never navigates away itself. */
export function useChatPlanEdits({
  read,
  applyCurriculum,
  regenerate,
  onDone,
  onFailure,
}: PlanEditDeps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return useMemo(
    () =>
      planEdits(
        { read, applyCurriculum, regenerate, onDone, onFailure },
        t,
        navigate,
      ),
    [applyCurriculum, navigate, onDone, onFailure, read, regenerate, t],
  );
}
