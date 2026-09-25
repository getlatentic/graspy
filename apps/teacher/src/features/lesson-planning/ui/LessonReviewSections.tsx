import { referenceSources, type LessonDraft } from "../domain/lessonPlanning";
import { type LessonCheck } from "../domain/lessonChecks";
import { ClassworkText } from "../../classwork/ui/ClassworkText";

export const reviewHeading = "m-0 mb-sm text-base text-ink";

/** The chevron a flex summary loses, drawn back in and rotated by open state. */
const disclosureChevron =
  "after:content-[''] after:border-r-[1.5px] after:border-b-[1.5px] after:border-muted after:rotate-45 after:transition-transform after:duration-[120ms] after:ease-[ease] motion-reduce:after:transition-none";
/** A fold opens on a tap, so it is sized for one rather than for its label. */
const summaryReset =
  "min-h-[2.75rem] cursor-pointer list-none [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-4";

/**
 * How the lesson will be taught, as a timed outline.
 *
 * The number and the duration bracket the title; what the step asks of the room
 * reads below them at the width of the whole step, level with the number.
 */
export function TeachingStepsList({ steps }: { readonly steps: LessonDraft["steps"] }) {
  return (
    <section>
      <h3 className={reviewHeading}>Lesson steps</h3>
      <ol className="m-0 grid list-none gap-lg p-0">
        {steps.map((step, index) => (
          <li key={step.id} className="grid grid-cols-[1.625rem_minmax(0,1fr)] items-start gap-x-md gap-y-2xs">
            <span
              className="grid size-[1.625rem] place-items-center rounded-[8px] bg-paper-accent text-sm font-bold text-brand"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 items-baseline justify-between gap-md">
              <strong className="min-w-0 [overflow-wrap:anywhere]">{step.title}</strong>
              {step.durationMinutes != null ? (
                <span className="shrink-0 whitespace-nowrap text-sm text-muted">
                  {step.durationMinutes} min
                </span>
              ) : null}
            </div>
            <div className="col-span-2 grid gap-2xs">
              <p className="m-0 leading-body text-ink-secondary"><b>Teacher:</b> {step.teacherActivity}</p>
              <p className="m-0 leading-body text-ink-secondary"><b>Learners:</b> {step.learnerActivity}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Where the lesson's content comes from, named as a teacher would cite it.
 *
 * The book once, the chapter its excerpts sit in, and the licence line the
 * source requires kept quiet beneath — not the title of every excerpt.
 */
export function ReferencesSection({ references }: { readonly references: string[] }) {
  return (
    <section>
      <h3 className={reviewHeading}>References</h3>
      {referenceSources(references).map((source) => (
        <div key={source.attribution || source.textbook} className="mt-sm first-of-type:mt-0">
          <p className="m-0 text-ink">
            {source.textbook}
            {source.chapter ? <span className="text-ink-secondary"> · {source.chapter}</span> : null}
          </p>
          {source.attribution ? (
            <p className="m-0 mt-xs text-xs leading-body text-muted">{source.attribution}</p>
          ) : null}
        </div>
      ))}
    </section>
  );
}

/** Which goal a check serves: context, kept out of the way until pointed at. */
function CheckGoal({ objective }: { readonly objective: string | null }) {
  if (!objective) return null;
  return (
    <span className="mt-3xs block text-xs text-muted opacity-0 transition-opacity duration-[120ms] ease-[ease] group-hover/item:opacity-100 group-focus-within/item:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none">
      {objective}
    </span>
  );
}

/**
 * The questions a lesson is checked with, folded away until asked for.
 *
 * A generated lesson can carry a dozen, and left open they bury the short list
 * of classwork beside them and the lesson above. The count is what a teacher
 * reads at a glance; a question opens to its expected answer and marking points.
 */
export function AssessmentList({ checks }: { readonly checks: readonly LessonCheck[] }) {
  return (
    <section>
      <details className="group/fold">
        <summary
          className={`flex items-center gap-sm ${summaryReset} ${disclosureChevron} after:ms-auto after:-mt-[0.2rem] after:size-[0.4rem] group-open/fold:after:mt-[0.1rem] group-open/fold:after:rotate-[225deg]`}
        >
          <h3 className="m-0 text-base text-ink">Assessment</h3>
          <span className="text-sm text-muted">
            {checks.length} question{checks.length === 1 ? "" : "s"}
          </span>
        </summary>
        <ol className="mt-sm mb-0 grid list-none gap-2xs p-0">
          {checks.map((check, index) => (
            <li key={`assessment-${index}`} className="group/item">
              {check.answer ? (
                <details className="group/check">
                  <summary
                    className={`flex items-start gap-sm py-2xs ${summaryReset} ${disclosureChevron} after:mt-[0.4rem] after:size-[0.35rem] after:flex-none group-open/check:after:mt-[0.55rem] group-open/check:after:rotate-[225deg]`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-ink-secondary">{check.question}</span>
                      <CheckGoal objective={check.objective} />
                    </span>
                  </summary>
                  <div className="mt-xs mb-sm rounded-card bg-paper-soft p-md">
                    <p className="m-0 mb-2xs text-xs font-semibold tracking-[0.05em] uppercase text-muted">
                      Expected answer
                    </p>
                    <ClassworkText text={check.answer} />
                    {check.rubric.length ? (
                      <ul className="mt-sm mb-0 ps-lg text-sm text-ink-secondary">
                        {check.rubric.map((point, pointIndex) => (
                          <li key={pointIndex}>{point}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </details>
              ) : (
                <div className="py-2xs">
                  <span className="text-ink-secondary">{check.question}</span>
                  <CheckGoal objective={check.objective} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export function ReviewList({ title, values }: { readonly title: string; readonly values: string[] }) {
  return (
    <section>
      <h3 className={reviewHeading}>{title}</h3>
      <ul className="m-0 grid list-disc gap-xs ps-lg text-ink-secondary marker:text-brand">
        {values.map((value, index) => (
          <li key={`${title}-${index}`}>{value}</li>
        ))}
      </ul>
    </section>
  );
}
