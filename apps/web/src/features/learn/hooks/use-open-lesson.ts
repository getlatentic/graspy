import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { isChatPath } from "../lib/app-sections";
import { TRY_CHAT } from "../lib/chat-targets";
import { lessonRequested, type LessonOpening } from "../lib/lesson-opening";

/** What a card in the chat does when the learner presses its button to open a lesson: goes to
 * the lesson, keeping the way back to this chat. A place the app does not know is not followed.
 * This is the one way the chat leaves for a lesson: nothing the tutor does takes the learner
 * there. */
export function useOpenLesson() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const fromChat = pathname === TRY_CHAT || isChatPath(pathname);
  return useCallback(
    (url: string) => {
      const lesson = lessonRequested(url);
      if (!lesson) return;
      const state: LessonOpening = {
        ...(fromChat ? { backToChat: `${pathname}${search}` } : {}),
        ...(lesson.lessonId ? { lessonId: lesson.lessonId } : {}),
      };
      navigate(lesson.path, { state });
    },
    [fromChat, navigate, pathname, search],
  );
}
