import { useState } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { practiceAnswer } from "@/lib/content";
import {
  topicOf,
  whereOf,
  type LessonCheck,
  type LessonTarget,
} from "@/lib/lesson";

export type LessonRecord = ReturnType<typeof useLessonRecord>;

// The host sees finish_lesson succeed and takes the learner on.
export function useLessonRecord(
  app: App,
  target: LessonTarget,
  viewUUID: string,
) {
  const [finishing, setFinishing] = useState(false);

  const answerCheck = (slide: number, check: LessonCheck, chosen: number) =>
    app
      .callServerTool({
        name: "answer_check",
        arguments: practiceAnswer(
          { ...check, question: check.prompt },
          chosen,
          whereOf(target),
          `${viewUUID}:${slide}`,
        ),
      })
      .catch((error: unknown) => console.error("answer_check failed:", error));

  const finish = async () => {
    setFinishing(true);
    try {
      const result = await app.callServerTool({
        name: "finish_lesson",
        arguments: topicOf(target),
      });
      if (result.isError) throw new Error("finish_lesson was refused");
    } catch (error) {
      console.error("Finishing the lesson failed:", error);
      setFinishing(false);
    }
  };

  return { answerCheck, finish, finishing };
}
