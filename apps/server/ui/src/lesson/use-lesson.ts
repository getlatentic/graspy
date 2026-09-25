import { useEffect, useState } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { lessonViewOf, type LessonView } from "@/lib/lesson";

// A slide takes the model several seconds to write; asking more often only
// spends requests.
const WATCH_MS = 2500;

async function callLessonTool(
  app: App,
  name: string,
  args: Record<string, unknown>,
): Promise<LessonView | null> {
  const result = await app.callServerTool({ name, arguments: args });
  return result.isError ? null : lessonViewOf(result.structuredContent);
}

export function useLesson(app: App, opened: LessonView) {
  const [view, setView] = useState(opened);
  const [openedWith, setOpenedWith] = useState(opened);
  // A look that found nothing re-arms the watch through this count.
  const [misses, setMisses] = useState(0);
  // Watching waits while the lesson is asked for again: a look that reached
  // the server first would show the failure being retried.
  const [asking, setAsking] = useState(false);

  // A tool result the host sends again replaces what the view has watched.
  if (opened !== openedWith) {
    setOpenedWith(opened);
    setView(opened);
  }

  useEffect(() => {
    if (view.status !== "making" || asking) return;
    let current = true;
    const timer = setTimeout(() => {
      callLessonTool(app, "lesson_progress", { target: view.target })
        .catch((error: unknown) => {
          console.error("Watching the lesson failed:", error);
          return null;
        })
        .then((next) => {
          if (!current) return;
          if (next) setView(next);
          else setMisses((count) => count + 1);
        });
    }, WATCH_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [app, view, misses, asking]);

  const askAgain = async () => {
    setAsking(true);
    setView((shown) => ({ ...shown, status: "making" }));
    const reopened = await callLessonTool(app, "give_lesson", {
      target: view.target,
      attempt: view.attempt + 1,
    }).catch(() => null);
    setView((shown) => reopened ?? { ...shown, status: "failed" });
    setAsking(false);
  };

  return { view, askAgain };
}
