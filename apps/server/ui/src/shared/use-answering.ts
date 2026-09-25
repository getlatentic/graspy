import { useState } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import {
  practiceAnswer,
  type PracticeQuestion,
  type ToolResult,
} from "@/lib/content";
import { scoreOf, type Chosen } from "./asks";
import { readViewState, writeViewState } from "./view-state";

const isChosen = (value: unknown): value is Chosen =>
  typeof value === "object" && value !== null;

// A message sent from the card calls answer_practice again for each answer,
// so a reload between the tap and the message loses none (the host sends
// each call once).
export function useAnswering(
  app: App,
  { viewUUID, where }: ToolResult<unknown>["_meta"],
  questions: PracticeQuestion[],
) {
  const stateKey = `graspy.choices.${viewUUID}`;
  const [chosen, setChosen] = useState(() =>
    readViewState(stateKey, isChosen, {}),
  );
  // The host refuses a message while graspy is still answering the last.
  const [busy, setBusy] = useState(false);

  const answer = (index: number, option: number) =>
    app
      .callServerTool({
        name: "answer_practice",
        arguments: practiceAnswer(
          questions[index],
          option,
          where,
          `${viewUUID}:${index}`,
        ),
      })
      .catch((error: unknown) =>
        console.error("answer_practice failed:", error),
      );

  const choose = (index: number, option: number) => {
    const next = { ...chosen, [index]: option };
    setChosen(next);
    writeViewState(stateKey, next);
    void answer(index, option);
  };

  const say = async (text: string) => {
    await Promise.all(
      Object.entries(chosen).map(([index, option]) =>
        answer(Number(index), option),
      ),
    );
    try {
      const { isError } = await app.sendMessage({
        role: "user",
        content: [{ type: "text", text }],
      });
      setBusy(Boolean(isError));
    } catch (error) {
      console.error("Sending the message failed:", error);
    }
  };

  const answered = questions.every((_, index) => chosen[index] !== undefined);
  const score = scoreOf(questions, chosen);
  return { chosen, choose, say, busy, answered, score };
}
