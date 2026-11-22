import { useCallback, useState } from "react";
import type { ChatLink } from "@/lib/chat-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { useI18n } from "@/lib/i18n-context";
import { SUBJECTS_PATH } from "@/lib/learn-paths";
import { changeSubjects } from "../lib/change-subjects";
import { namesAfter } from "../lib/curriculum-edit";
import type { ActionOf } from "./use-chat-plan-edits";
import type { LearnerPlan } from "./use-learner-plan";

interface SubjectChangeDeps extends Pick<LearnerPlan, "applyCurriculum"> {
  /** The plan as it is now, after the edits made before this one. */
  read: () => CurriculumData | null;
  onDone: (message: string, link?: ChatLink) => void;
  onFailure: (message: string) => void;
  confirmDrop: (change: {
    type: "change_subjects";
    names: string[];
    removed: string[];
  }) => void;
}

/** Dropping a subject clears its progress, so it waits for the learner. */
export function useSubjectChange({
  read,
  applyCurriculum,
  onDone,
  onFailure,
  confirmDrop,
}: SubjectChangeDeps) {
  const { t } = useI18n();
  const [changing, setChanging] = useState(false);

  const setSubjects = useCallback(
    async (names: string[]) => {
      const current = read();
      if (!current) return;
      setChanging(true);
      try {
        await applyCurriculum(await changeSubjects(current, names));
        onDone(t("chat.subjectsChanged"), {
          label: t("chat.seeSubjects"),
          to: SUBJECTS_PATH,
        });
      } catch (error) {
        console.error("Changing subjects from the chat failed:", error);
        onFailure(t("chat.planChangeFailed"));
      } finally {
        setChanging(false);
      }
    },
    [applyCurriculum, onDone, onFailure, read, t],
  );

  const askToChange = useCallback(
    async ({ add, remove }: ActionOf<"change_subjects">) => {
      const current = read();
      if (!current) return;
      const names = namesAfter(current.subjects, add, remove);
      const removed = current.subjects
        .map((subject) => subject.name)
        .filter((name) => !names.includes(name));
      if (removed.length > 0) {
        confirmDrop({ type: "change_subjects", names, removed });
      } else {
        await setSubjects(names);
      }
    },
    [confirmDrop, read, setSubjects],
  );

  return { setSubjects, askToChange, changing };
}
