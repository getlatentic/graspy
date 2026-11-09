import { useState } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { helpOf, practiceAnswer, type Help } from "@/lib/content";
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

  // The help the server gives a wrong answer; none when it cannot be reached, as the answer is then
  // kept to be sent later.
  const answerCheck = (
    slide: number,
    check: LessonCheck,
    chosen: number,
    tried: number[],
  ): Promise<Help | null> =>
    app
      .callServerTool({
        name: "answer_check",
        arguments: practiceAnswer(
          { ...check, question: check.prompt },
          chosen,
          whereOf(target),
          `${viewUUID}:${slide}`,
          { slide, tried },
        ),
      })
      .then((result) => helpOf(result.structuredContent))
      .catch((error: unknown) => {
        console.error("answer_check failed:", error);
        return null;
      });

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
