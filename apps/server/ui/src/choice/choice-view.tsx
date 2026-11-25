import { isChoiceSet, type ChoiceSet } from "@/lib/content";
import { cn } from "@/shared/cn";
import { useToolResult, type Shown } from "@/shared/use-tool-result";
import { useChoosing, type Picked } from "./use-choosing";

const OPTION =
  "disabled:cursor-default rounded-full border-2 px-4 py-2 text-start text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const styleOf = (picked: Picked, index: number) =>
  picked === index
    ? "border-accent bg-accent text-on-accent"
    : "border-line bg-surface text-ink hover:border-accent disabled:opacity-50 disabled:hover:border-line";

export function ChoiceView() {
  const shown = useToolResult("graspy choice", (value) =>
    isChoiceSet(value) ? value : null,
  );
  return shown && <Choice shown={shown} />;
}

function Choice({ shown }: { shown: Shown<ChoiceSet> }) {
  const { app, result, words } = shown;
  const { question, options } = result.structuredContent;
  const { picked, answered, refused, choose, other } = useChoosing(
    app,
    result._meta.viewUUID,
    options,
  );

  return (
    <section
      aria-label={words.choice.label}
      className="space-y-3 rounded-card border border-line bg-surface p-4"
    >
      <p dir="auto" className="font-semibold text-ink">
        {question}
      </p>
      {/* Long lists, such as a country's classes, scroll inside the card. */}
      <div className="flex max-h-60 flex-wrap gap-2 overflow-y-auto p-1">
        {options.map((option, index) => (
          <button
            key={index}
            type="button"
            dir="auto"
            onClick={() => void choose(index)}
            disabled={answered}
            aria-pressed={picked === index}
            className={cn(OPTION, styleOf(picked, index))}
          >
            {option}
          </button>
        ))}
        <button
          type="button"
          onClick={other}
          disabled={answered}
          aria-pressed={picked === "other"}
          className={cn(
            OPTION,
            picked === "other"
              ? "border-accent bg-accent-soft text-ink"
              : "border-dashed border-line bg-surface text-muted hover:border-accent",
          )}
        >
          {words.choice.other}
        </button>
      </div>
      {picked === "other" && (
        <p role="status" className="text-sm text-muted">
          {words.choice.typeBelow}
        </p>
      )}
      {refused && (
        <p role="status" className="text-sm text-muted">
          {words.choice.busy}
        </p>
      )}
    </section>
  );
}
