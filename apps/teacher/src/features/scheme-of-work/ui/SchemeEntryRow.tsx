import { Button } from "@carbon/react";

import type { SchemeEntry } from "../domain/schemeOfWork";

/**
 * What this week's plan offers about its lesson.
 *
 * A weekly plan carries at most one lesson, so starting one and opening one are
 * never both on offer. Saying it as one value rather than two callbacks is what
 * keeps "plan a second lesson" unrepresentable — the library refuses it, and the
 * screen should never have asked.
 */
export type SchemeEntryLessonAction =
  | { readonly kind: "plan"; readonly onPlan: () => void }
  | { readonly kind: "open"; readonly onOpen: () => void }
  | { readonly kind: "none" };

/**
 * One week's plan: what pupils should learn, and what can be done about it.
 *
 * Whether this is the plan being edited or archived stays with the week —
 * only one of either can be at a time — so this is told, not asked.
 */
export function SchemeEntryRow({
  entry,
  lessonAction,
  onEdit,
  archiving,
  moving,
}: {
  readonly entry: SchemeEntry;
  readonly lessonAction: SchemeEntryLessonAction;
  readonly onEdit: () => void;
  /**
   * The weeks this subtopic could be taught in instead, and the move itself.
   *
   * A class that falls behind has to be able to say so: the scheme is what the
   * week's plan is written against, so a scheme that no longer matches the room
   * plans the wrong lesson.
   */
  readonly moving?: {
    readonly weeks: readonly { readonly id: string; readonly ordinal: number }[];
    readonly pending: boolean;
    readonly onMove: (weekId: string) => void;
  };
  readonly archiving: {
    /** True once archiving has been asked for and is waiting to be confirmed. */
    readonly armed: boolean;
    readonly pending: boolean;
    readonly onArm: () => void;
    readonly onCancel: () => void;
    readonly onConfirm: () => void;
  };
}) {
  return (
    <article className="grid gap-lg border-t border-rule pt-lg">
      <div className="flex flex-col items-start gap-md sm:flex-row sm:items-center sm:justify-between [&_span]:text-sm [&_span]:font-extrabold [&_span]:text-accent">
        <div>
          <span>{entry.curriculumUnit.title}</span>
          <h4 className="m-0 text-md font-extrabold text-ink">{entry.topic}</h4>
          {entry.subtopic ? <p className="mt-2xs mb-0 text-ink-secondary">{entry.subtopic}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2xs [&_.cds--btn]:whitespace-nowrap [&_.cds--btn]:rounded-none">
          {lessonAction.kind === "plan" ? (
            <Button size="sm" onClick={lessonAction.onPlan}>
              Plan lesson
            </Button>
          ) : null}
          {lessonAction.kind === "open" ? (
            <Button size="sm" kind="tertiary" onClick={lessonAction.onOpen}>
              Open lesson
            </Button>
          ) : null}
          <Button
            kind="ghost"
            size="sm"
            onClick={onEdit}
          >
            Edit
          </Button>
          {moving?.weeks.length ? (
            <label className="flex items-center gap-xs text-sm text-muted">
              <span>Move to</span>
              <select
                className="min-h-[2.75rem] cursor-pointer rounded-card border border-rule bg-paper px-sm text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
                aria-label={`Move ${entry.subtopic ?? entry.topic} to another week`}
                value=""
                disabled={moving.pending}
                onChange={(event) => {
                  if (event.currentTarget.value) moving.onMove(event.currentTarget.value);
                }}
              >
                <option value="">Week…</option>
                {moving.weeks.map((week) => (
                  <option key={week.id} value={week.id}>
                    Week {week.ordinal}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {archiving.armed ? (
            <>
              <Button
                kind="danger--ghost"
                size="sm"
                disabled={archiving.pending}
                onClick={archiving.onConfirm}
              >
                Confirm archive
              </Button>
              <Button kind="ghost" size="sm" onClick={archiving.onCancel}>
                Cancel
              </Button>
            </>
          ) : (
            // Putting a week's plan away is not the same kind of act as editing
            // it; reading as its equal neighbour is what made a teacher afraid
            // of the row.
            <Button kind="danger--ghost" size="sm" onClick={archiving.onArm}>
              Archive
            </Button>
          )}
        </div>
      </div>
      <dl className="m-0 grid gap-md sm:grid-cols-3 [&_dd]:m-0 [&_dd]:leading-body [&_dd]:text-ink-secondary [&_div]:grid [&_div]:gap-2xs [&_dt]:text-sm [&_dt]:font-extrabold [&_dt]:text-ink">
        <div>
          <dt>What pupils should learn</dt>
          <dd>{entry.curriculumOutcomes.map(({ statement }) => statement).join(" · ")}</dd>
        </div>
        <div>
          <dt>Goals for the week</dt>
          <dd>{entry.objectives.join(" · ")}</dd>
        </div>
        <div>
          <dt>How you will check learning</dt>
          <dd>{entry.assessment.join(" · ")}</dd>
        </div>
        {entry.instructionalMaterials.length > 0 ? (
          <div>
            <dt>Instructional materials</dt>
            <dd>{entry.instructionalMaterials.join(" · ")}</dd>
          </div>
        ) : null}
        {entry.notes ? (
          <div>
            <dt>Teacher notes</dt>
            <dd>{entry.notes}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}
