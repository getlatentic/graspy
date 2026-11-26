import { useEffect, useState } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { isText, type StartLesson } from "@/lib/content";

// The same pace the lesson's own view watches at: a slide takes the model seconds to write.
const WATCH_MS = 2500;

type Status = StartLesson["status"];

interface Made {
  status: Status;
  lessonId: string | null;
  attempt: number;
}

const STATUSES = new Set<string>(["ready", "making", "failed"]);

/** The lesson's state from give_lesson's or lesson_progress's result; null for one that is not. */
function madeOf(structured: unknown): Made | null {
  const state = structured as {
    status?: unknown;
    lessonId?: unknown;
    attempt?: unknown;
  } | null;
  if (!isText(state?.status) || !STATUSES.has(state.status)) return null;
  return {
    status: state.status as Status,
    lessonId: isText(state.lessonId) ? state.lessonId : null,
    attempt: Number.isInteger(state.attempt) ? (state.attempt as number) : 0,
  };
}

async function ask(
  app: App,
  name: string,
  args: Record<string, unknown>,
): Promise<Made | null> {
  const result = await app.callServerTool({ name, arguments: args });
  return result.isError ? null : madeOf(result.structuredContent);
}

/** Where the lesson is opened from the chat: its path, and the lesson made for it, so that opening
 * it asks for that lesson by its id rather than making another. */
export function openUrl(start: StartLesson, lessonId: string | null): string {
  return lessonId
    ? `${start.openPath}?lesson=${encodeURIComponent(lessonId)}`
    : start.openPath;
}

/** A lesson still being made is watched until it is made or has failed, and one that failed is
 * asked for again. Opening it is the learner's to do. */
export function useStart(app: App, start: StartLesson) {
  const [made, setMade] = useState<Made>({
    status: start.status,
    lessonId: start.lessonId,
    attempt: 0,
  });
  // A look that found nothing re-arms the watch through this count.
  const [misses, setMisses] = useState(0);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (made.status !== "making" || asking) return;
    let current = true;
    const timer = setTimeout(() => {
      ask(app, "lesson_progress", { target: start.target })
        .catch((error: unknown) => {
          console.error("Watching the lesson failed:", error);
          return null;
        })
        .then((next) => {
          if (!current) return;
          if (next) setMade(next);
          else setMisses((count) => count + 1);
        });
    }, WATCH_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [app, start.target, made, misses, asking]);

  const tryAgain = async () => {
    setAsking(true);
    setMade((now) => ({ ...now, status: "making" }));
    const reopened = await ask(app, "give_lesson", {
      target: start.target,
      attempt: made.attempt + 1,
    }).catch(() => null);
    setMade((now) => reopened ?? { ...now, status: "failed" });
    setAsking(false);
  };

  const open = () =>
    app
      .openLink({ url: openUrl(start, made.lessonId) })
      .catch((error: unknown) =>
        console.error("Opening the lesson failed:", error),
      );

  return { made, tryAgain, open };
}
