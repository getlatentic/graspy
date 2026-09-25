import { StatusPill } from "../../../ui/StatusPill";
import {
  lessonListLabel,
  type CurrentTeachingWeek,
  type WorkspaceLesson,
} from "../domain/lessonPlanning";

/**
 * Every lesson of the class and term, in the order the scheme sets them.
 *
 * One list of lessons, and nothing above them but its own name. It carried
 * headings twice over: four bands for when a lesson fell — this week, later,
 * not scheduled, earlier — and a topic heading inside each. A teacher passed
 * two headings to reach a lesson, met the same topic in two places, and could
 * not tell where a group ended, because a topic holding a single lesson was
 * drawn without a heading and its row ran on under the group above.
 *
 * What each of those headings said is a fact about a lesson, so each row says
 * it: what it covers, the topic it sits under, and when it is taught.
 *
 * Selecting an entry is the parent's to resolve — a planned lesson loads, an
 * unplanned scheme entry opens its start choices — so the list only says which
 * one is current and reports the click.
 */
export function LessonList({
  lessons,
  currentWeek,
  selectedLessonId,
  planningKey,
  onSelect,
}: {
  readonly lessons: readonly WorkspaceLesson[];
  readonly currentWeek: CurrentTeachingWeek | null;
  readonly selectedLessonId: string | null;
  readonly planningKey: string | null;
  readonly onSelect: (lesson: WorkspaceLesson) => void;
}) {
  return (
    <nav
      className="min-w-0 overflow-hidden rounded-card border border-rule bg-paper min-[60rem]:sticky min-[60rem]:top-lg min-[60rem]:max-h-[calc(100%-var(--spacing-2xl))] min-[60rem]:overflow-y-auto"
      aria-label="Lessons in this class and term"
    >
      {/* The heading above this list says "This week", so without a line of its
          own the list reads as the week's. It is the term's. */}
      <h2 className="m-0 border-b border-rule px-[20px] py-[13px] text-sm font-semibold text-ink">
        Every lesson this term
      </h2>
      {lessons.length > 0 ? (
        <ul className="m-0 list-none p-0">
          {lessons.map((lesson) => (
            <LessonRow
              key={lesson.key}
              lesson={lesson}
              among={lessons}
              currentWeek={currentWeek}
              current={
                lesson.status === "unplanned"
                  ? planningKey === lesson.key
                  : lesson.lessonId === selectedLessonId
              }
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : (
        <div className="grid min-h-[20rem] content-center gap-sm p-xl">
          <h2 className="m-0 font-display font-extrabold tracking-[-0.035em] text-ink">
            No lessons yet
          </h2>
          <p className="m-0 max-w-[48ch] leading-body text-ink-secondary">
            Start from a weekly plan or create an unscheduled lesson draft.
          </p>
        </div>
      )}
    </nav>
  );
}

/** One lesson: what it covers, where it sits, and how far it has got. */
function LessonRow({
  lesson,
  among,
  currentWeek,
  current,
  onSelect,
}: {
  readonly lesson: WorkspaceLesson;
  readonly among: readonly WorkspaceLesson[];
  readonly currentWeek: CurrentTeachingWeek | null;
  readonly current: boolean;
  readonly onSelect: (lesson: WorkspaceLesson) => void;
}) {
  const label = lessonListLabel(lesson, { among, currentWeek });
  const unplanned = lesson.status === "unplanned";
  const standing =
    lesson.status === "confirmed" ? "Confirmed" : unplanned ? "No plan yet" : "Draft";
  return (
    <li className="border-b border-rule">
      <button
        type="button"
        className={`grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-sm gap-y-[5px] border-0 px-[20px] py-[14px] text-start text-ink focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2 ${
          current
            ? "bg-paper-accent shadow-[inset_3px_0_0_var(--color-brand)] hover:bg-paper-accent"
            : "bg-transparent hover:bg-paper-soft focus-visible:bg-paper-soft"
        }`}
        aria-label={[label.headline, label.context, standing].filter(Boolean).join(", ")}
        aria-current={current ? "true" : undefined}
        onClick={() => onSelect(lesson)}
      >
        <strong className="col-start-1 row-start-1 text-md font-semibold [overflow-wrap:anywhere]">
          {label.headline}
        </strong>
        {label.context ? (
          <span className="col-span-full row-start-2 text-sm text-ink-secondary">
            {label.context}
          </span>
        ) : null}
        <StatusPill
          className="col-start-2 row-start-1 self-center justify-self-end"
          size="sm"
          tone={lesson.status === "confirmed" ? "positive" : unplanned ? "pending" : "neutral"}
        >
          {standing}
        </StatusPill>
      </button>
    </li>
  );
}
