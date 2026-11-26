import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { SUBJECTS_PATH } from "@/lib/learn-paths";
import { isChatPath } from "../lib/app-sections";
import { TRY_CHAT, subjectOf } from "../lib/chat-targets";
import { lessonRequested, type LessonOpening } from "../lib/lesson-opening";
import { usePlan } from "../learner-context";

/** What the Open button of a lesson card does when the learner presses it: goes to the lesson,
 * keeping the way back to this chat. A place the app does not know is not followed. A lesson of a
 * course that is not in the plan under the slug the card names (the plan made another, or the
 * course was not added) is not opened at a page that is not there: the learner is taken to their
 * subjects, where what was added is. This is the one way the chat leaves for a lesson: nothing
 * the tutor does takes the learner there. */
export function useOpenLesson() {
  const navigate = useNavigate();
  const { curriculum } = usePlan();
  const { pathname, search } = useLocation();
  const fromChat = pathname === TRY_CHAT || isChatPath(pathname);
  return useCallback(
    (url: string) => {
      const lesson = lessonRequested(url);
      if (!lesson) return;
      const slug = decodeURIComponent(lesson.path.split("/")[3] ?? "");
      const here = subjectOf(curriculum, slug) !== null;
      const state: LessonOpening = {
        ...(fromChat ? { backToChat: `${pathname}${search}` } : {}),
        ...(here && lesson.lessonId ? { lessonId: lesson.lessonId } : {}),
      };
      navigate(here ? lesson.path : SUBJECTS_PATH, { state });
    },
    [curriculum, fromChat, navigate, pathname, search],
  );
}
