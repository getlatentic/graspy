import { lessonStages } from "../domain/lessonProgress";

/**
 * The three steps a lesson goes through, shown wherever the teacher is standing
 * in them.
 *
 * Writing, confirming and writing the classwork each take their own screen, so a
 * teacher arriving on one had no way to see it was the middle of something. The
 * same strip appears on the lesson and on the classwork, which is what makes the
 * move between them read as a next step rather than a new place.
 */
export function LessonProgress({
  status,
  hasPlan,
  classworkWritten,
  onGoToNow,
}: {
  readonly status: "draft" | "confirmed";
  readonly hasPlan: boolean;
  /** Whether every part of this lesson's classwork is written. */
  readonly classworkWritten: boolean;
  /**
   * Takes the teacher to the step they are on, where the screen has somewhere
   * to take them. Naming the next step at the top of a lesson and putting the
   * only way to do it seven lesson steps below made the strip a sign rather
   * than a way through.
   */
  readonly onGoToNow?: (() => void) | null;
}) {
  const stages = lessonStages({ status, hasPlan, classworkWritten });

  return (
    <nav aria-label="This lesson's progress">
      {/* Three numbered steps at the top of a lesson read as the product's
          three steps unless something says whose they are. A screen reader was
          told by the landmark; the eye was told nothing. */}
      <ol className="m-0 flex list-none flex-wrap items-center gap-x-md gap-y-2xs p-0">
        <li className="text-sm font-extrabold text-muted" aria-hidden="true">
          This lesson
        </li>
        {stages.map(({ name, state }, index) => (
          <li
            className="group/stage flex items-center gap-xs text-sm text-muted data-[state=now]:font-bold data-[state=now]:text-ink data-[state=done]:text-ink-secondary"
            data-state={state}
            key={name}
          >
            <span
              className="grid size-[1.25rem] flex-none place-items-center rounded-pill border border-rule-strong text-xs group-data-[state=done]/stage:border-accent group-data-[state=done]/stage:bg-accent group-data-[state=done]/stage:text-paper group-data-[state=now]/stage:border-accent group-data-[state=now]/stage:text-accent"
              aria-hidden="true"
            >
              {state === "done" ? "✓" : index + 1}
            </span>
            {state === "now" && onGoToNow ? (
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 font-bold text-inherit underline [text-underline-offset:0.2em] hover:text-accent focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-4"
                onClick={onGoToNow}
              >
                {name}
              </button>
            ) : (
              name
            )}
            <span className="sr-only">
              {state === "done" ? " — done" : state === "now" ? " — you are here" : " — still to do"}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
