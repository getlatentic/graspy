import { whatNext, whenNext, type NextTeachingSlot } from "../domain/classTimetable";

/**
 * What the teacher is teaching next, on one line above their classes.
 *
 * The front screen greeted a teacher and told them which week of the term it
 * was. What they came to find out is what happens in the next period, so that
 * is what leads — and it stays a band rather than a panel, because pushing the
 * classes off the screen to say one sentence is a poor trade.
 */
export function NextClassPanel({
  next,
  onSetTimetable,
  onOpenClass,
}: {
  readonly next: NextTeachingSlot | null;
  readonly onSetTimetable: () => void;
  readonly onOpenClass: (assignmentId: string) => void;
}) {
  if (!next) {
    return (
      <section className={`${band} border-rule-strong bg-paper-soft`} aria-labelledby="next-class-title">
        <p className="m-0 min-w-0 text-ink-secondary" id="next-class-title">
          Say which periods you teach each class and graspy will say what is next.
        </p>
        <button type="button" className={bandAction} onClick={onSetTimetable}>
          Set your timetable
        </button>
      </section>
    );
  }

  return (
    <section className={`${band} border-brand bg-paper-accent`} aria-labelledby="next-class-title">
      <p className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-sm gap-y-2xs" id="next-class-title">
        <span className="font-extrabold tracking-[0.01em] text-accent">{whenNext(next)}</span>
        <span className="font-semibold text-ink">
          {next.className} · {next.subject}
        </span>
        <span className="text-ink-secondary">{whatNext(next)}</span>
      </p>
      <button
        type="button"
        className={bandAction}
        onClick={() => onOpenClass(next.teachingAssignmentId)}
      >
        Open this class
      </button>
    </section>
  );
}

const band =
  "flex flex-wrap items-center justify-between gap-x-lg gap-y-xs border-s-[3px] py-sm ps-md pe-lg";
const bandAction =
  "shrink-0 cursor-pointer border-0 bg-transparent p-0 text-sm font-bold text-accent underline [text-underline-offset:0.2em] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-4";
