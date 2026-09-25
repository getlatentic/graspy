import { PencilLine } from "lucide-react";
import { isPracticeSet } from "@/lib/content";
import { askAnotherPractice } from "@/shared/asks";
import { QuestionCard } from "@/shared/question-card";
import { useToolResult } from "@/shared/use-tool-result";

export function PracticeView() {
  const shown = useToolResult("graspy practice", (value) =>
    isPracticeSet(value) ? value : null,
  );
  if (!shown) return null;
  const words = shown.words.practice;
  const { instruction, questions } = shown.result.structuredContent;

  return (
    <QuestionCard
      shown={shown}
      label={words.label}
      icon={PencilLine}
      intro={
        instruction && (
          <p dir="auto" className="text-sm text-ink">
            {instruction}
          </p>
        )
      }
      anotherLabel={questions.length > 1 ? words.anotherSet : words.another}
      askAnother={(score) => askAnotherPractice(questions, score, words)}
    />
  );
}
