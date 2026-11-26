import { useId } from "react";
import { isPathChoice, type PathChoice, type PlannedPath } from "@/lib/content";
import { cn } from "@/shared/cn";
import { useToolResult, type Shown } from "@/shared/use-tool-result";
import { fill } from "@/shared/words";
import { stepKey, MAX_CHANGES } from "./answer-text";
import { usePathChoice } from "./use-path-choice";

const BUTTON =
  "rounded-full border-2 px-5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50";

export function PathView() {
  const shown = useToolResult("graspy path", (value) =>
    isPathChoice(value) ? value : null,
  );
  return shown && <Path shown={shown} />;
}

function Path({ shown }: { shown: Shown<PathChoice> }) {
  const { app, result, words } = shown;
  const choice = result.structuredContent;
  const path = usePathChoice(app, result._meta.viewUUID, choice, words.path);

  return (
    <form
      aria-label={words.path.label}
      onSubmit={(event) => {
        event.preventDefault();
        void path.add();
      }}
      className="space-y-4 rounded-card border border-line bg-surface p-4"
    >
      {choice.paths.map((course, at) => (
        <Course
          key={at}
          course={course}
          at={at}
          off={path.off}
          disabled={path.sent}
          onToggle={path.toggle}
        />
      ))}
      {path.saying && (
        <div className="space-y-2">
          <textarea
            aria-label={words.path.missingPlaceholder}
            dir="auto"
            rows={2}
            maxLength={MAX_CHANGES}
            value={path.note}
            disabled={path.sent}
            placeholder={words.path.missingPlaceholder}
            onChange={(event) => path.write(event.target.value)}
            className="w-full resize-none rounded-control border-2 border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          />
          <button
            type="button"
            disabled={!path.canSay}
            onClick={() => void path.say()}
            className={cn(
              BUTTON,
              "border-line bg-surface text-ink hover:border-accent",
            )}
          >
            {words.path.send}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!path.canAdd}
          className={cn(
            BUTTON,
            "border-accent bg-accent text-on-accent hover:bg-accent-strong disabled:hover:bg-accent",
          )}
        >
          {fill(words.path.add, { count: String(path.chosen) })}
        </button>
        {!path.saying && (
          <button
            type="button"
            disabled={path.sent}
            onClick={path.openNote}
            className="rounded-full px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {words.path.missing}
          </button>
        )}
      </div>
      {path.refused && (
        <p role="status" className="text-sm text-muted">
          {words.path.busy}
        </p>
      )}
    </form>
  );
}

interface CourseProps {
  course: PlannedPath;
  at: number;
  off: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (path: number, step: number) => void;
}

function Course({ course, at, off, disabled, onToggle }: CourseProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-1">
      <h3 id={id} dir="auto" className="font-semibold text-ink">
        {course.subject}
      </h3>
      <ul className="max-h-80 space-y-0.5 overflow-y-auto">
        {course.steps.map((step, index) => (
          <li key={index}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 py-1.5 hover:bg-accent-soft has-disabled:cursor-default has-disabled:hover:bg-transparent">
              <input
                type="checkbox"
                checked={!off.has(stepKey(at, index))}
                disabled={disabled}
                onChange={() => onToggle(at, index)}
                className="size-5 shrink-0 accent-accent"
              />
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block text-sm text-ink">
                  {step.title}
                </span>
                <span dir="auto" className="block text-xs text-muted">
                  {step.level}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
