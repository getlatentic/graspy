import { DiscardLesson } from "./DiscardLesson";
import { LessonStartRoutes } from "./LessonStartRoutes";
import { eyebrow } from "../../../ui/chrome";

/**
 * A lesson the scheme commits the teacher to that has no plan written yet.
 *
 * Whether it has no record at all or a bare draft seeded from the scheme, it is
 * the same stage — nothing to teach from — so it reads the same way: the lesson
 * exists, and here is how its plan gets written. Every route writes back to this
 * lesson; "Draft with graspy" prepares it there and then.
 */
export function UnplannedLesson({
  topic,
  subtopic,
  weekOrdinal,
  covers,
  onTakeOneSubtopic,
  onStartBlank,
  onDraftWithGraspy,
  onBringYourOwn,
  discarding,
}: {
  readonly topic: string;
  readonly subtopic: string | null;
  readonly weekOrdinal: number | null;
  /**
   * The subtopics this plan will cover, when it covers a whole week.
   *
   * A teacher writes one plan for the week, so the screen has to say what that
   * one plan is for — otherwise it reads as a plan for the topic and the other
   * two subtopics of the week go unaccounted for.
   */
  readonly covers?: readonly string[];
  /**
   * Taking one subtopic of this week instead, when that is the lesson.
   *
   * The week is what a teacher is offered first because it is what they write.
   * Choosing a subtopic here is the other half of that choice, and it has to be
   * said out loud — reaching it by planning a subtopic before the week is not a
   * choice anyone would find.
   */
  readonly onTakeOneSubtopic?: (subtopic: string) => void;
  readonly onStartBlank: () => void;
  readonly onDraftWithGraspy: () => void;
  readonly onBringYourOwn: () => void;
  /**
   * Clearing this lesson, when it is a lesson rather than a week the scheme
   * commits the teacher to.
   *
   * A start nobody carried through leaves a row here for ever, and three of the
   * same subtopic tell a teacher nothing. A week the scheme sets is not the
   * teacher's to throw away, so it is offered nothing.
   */
  readonly discarding?: { readonly pending: boolean; readonly onDiscard: () => void };
}) {
  return (
    <article className="grid gap-xl">
      <header className="flex items-start justify-between gap-md border-b border-rule pb-lg">
        <div>
          <p className={eyebrow}>{subtopic ? topic : "Lesson"}</p>
          <h2 className="m-0 font-display font-extrabold tracking-[-0.035em] text-ink">
            {subtopic ?? topic}
          </h2>
          {weekOrdinal ? <p>Week {weekOrdinal}</p> : null}
        </div>
      </header>

      <div className="grid justify-items-center gap-sm py-2xl text-center">
        <h3 className="m-0 text-lg text-ink">
          {covers?.length ? "This week has no plan yet" : "This lesson has no plan yet"}
        </h3>
        <p className="m-0 max-w-[52ch] text-ink-secondary">
          Start from a blank plan, let graspy draft one, or bring your own.
        </p>
        {covers?.length ? (
          <p className="m-0 max-w-[52ch] text-ink-secondary">
            One plan for the week, covering {joined(covers)}.
          </p>
        ) : null}
        <div className="mb-lg" />
        <LessonStartRoutes
          onStartBlank={onStartBlank}
          onDraftWithGraspy={onDraftWithGraspy}
          onBringYourOwn={onBringYourOwn}
        />
        {covers && covers.length > 1 && onTakeOneSubtopic ? (
          <div className="mt-xl grid justify-items-center gap-sm border-t border-rule pt-lg">
            <p className="m-0 text-sm text-muted">Or plan just one of them:</p>
            <div className="flex flex-wrap justify-center gap-sm">
              {covers.map((subtopic) => (
                <button
                  key={subtopic}
                  type="button"
                  className="min-h-[2.75rem] cursor-pointer rounded-card border border-rule bg-paper px-lg py-sm text-sm text-ink hover:bg-paper-soft focus-visible:outline-2 focus-visible:outline-focus"
                  onClick={() => onTakeOneSubtopic(subtopic)}
                >
                  {subtopic}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {discarding ? (
        <footer className="border-t border-rule pt-lg">
          <DiscardLesson
            covers={subtopic ?? topic}
            pending={discarding.pending}
            onDiscard={discarding.onDiscard}
          />
        </footer>
      ) : null}
    </article>
  );
}

/** The week's subtopics as a teacher would say them aloud. */
function joined(covers: readonly string[]): string {
  if (covers.length === 1) return covers[0]!;
  return `${covers.slice(0, -1).join(", ")} and ${covers[covers.length - 1]}`;
}
