import { BookOpen } from "lucide-react";
import { isPassageSet, type PassageSet } from "@/lib/content";
import { askAnotherPassage } from "@/shared/asks";
import { InlineMarkdown } from "@/shared/markdown";
import { QuestionCard } from "@/shared/question-card";
import { useToolResult } from "@/shared/use-tool-result";

function Passage({ set }: { set: PassageSet }) {
  const paragraphs = set.passage.split(/\n\s*\n/).filter((p) => p.trim());
  return (
    <div className="space-y-3">
      <h1 dir="auto" className="text-lg font-semibold text-ink">
        {set.title}
      </h1>
      <article
        dir="auto"
        className="space-y-3 rounded-control bg-raised px-4 py-3 leading-7 text-ink"
      >
        {paragraphs.map((paragraph, index) => (
          <p key={index}>
            <InlineMarkdown source={paragraph} />
          </p>
        ))}
      </article>
      {set.instruction && (
        <p dir="auto" className="text-sm text-ink">
          {set.instruction}
        </p>
      )}
    </div>
  );
}

export function PassageView() {
  const shown = useToolResult("graspy passage", (value) =>
    isPassageSet(value) ? value : null,
  );
  if (!shown) return null;
  const { words } = shown;

  return (
    <QuestionCard
      shown={shown}
      label={words.passage.label}
      icon={BookOpen}
      intro={<Passage set={shown.result.structuredContent} />}
      anotherLabel={words.passage.another}
      askAnother={(score) => askAnotherPassage(score, words)}
    />
  );
}
