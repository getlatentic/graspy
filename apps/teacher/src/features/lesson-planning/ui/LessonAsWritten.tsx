import { Button } from "@carbon/react";

import type { GranularLessonRecord } from "../domain/granularLesson";
import { lessonContentFromGranularPlan } from "../domain/lessonContentFromGranular";
import { groupByAttribution, sourceSummary } from "../domain/lessonSources";
import { PreparedLesson } from "./PreparedLesson";

/**
 * What a prepared lesson says before anyone edits it.
 *
 * The reading view is one thing — the plan, where it came from, and the
 * decision the screen exists for — and it sat inline beside the editing form,
 * so which parts belonged to reading and which to editing was a matter of
 * following `editing ? null :` down the file.
 */
export function PreparedNotice({ beingPreparedAgain }: { readonly beingPreparedAgain: boolean }) {
  return (
    <div className="flex items-start gap-sm bg-paper-accent border-l-[3px] border-brand p-md mb-lg">
      <svg className="flex-none mt-[1px] text-brand" width="20" height="20" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
        <path d="M16 2a14 14 0 1 0 14 14A14 14 0 0 0 16 2zm-2 19.59-5-5L10.59 15 14 18.41 21.41 11 23 12.59z" />
      </svg>
      <p className="m-0 text-md leading-body text-ink">
        {beingPreparedAgain ? (
          <>
            <strong className="font-semibold">graspy is writing this lesson again.</strong>{" "}
            This is the version you had before. Confirming waits until the new
            one is ready, so you do not approve a plan that is about to change.
          </>
        ) : (
          <>
            <strong className="font-semibold">Prepared — review before you confirm.</strong>{" "}
            graspy drafted the plan from your curriculum. Edit anything, then confirm.
          </>
        )}
      </p>
    </div>
  );
}

/** The lesson as graspy wrote it, its sources, and the decision to confirm. */
export function LessonAsWritten({
  plan,
  pending,
  beingPreparedAgain,
  onEdit,
  onRedraft,
}: {
  readonly plan: GranularLessonRecord["plan"];
  readonly pending: boolean;
  readonly beingPreparedAgain: boolean;
  readonly onEdit: () => void;
  readonly onRedraft: () => void;
}) {
  return (
    <>
              <PreparedLesson content={lessonContentFromGranularPlan(plan)} />
              <details className="px-lg">
                <summary className="grid min-h-[2.75rem] cursor-pointer gap-2xs">{sourceSummary(plan.references)}</summary>
                {groupByAttribution(plan.references).map(({ attribution, titles }) => (
                  <div className="mt-lg first-of-type:mt-0" key={attribution}>
                    <ul className="m-0 list-none p-0">
                      {titles.map((title) => (
                        <li key={title}>{title}</li>
                      ))}
                    </ul>
                    <p className="mt-sm mb-0 text-sm leading-ui text-muted">{attribution}</p>
                  </div>
                ))}
              </details>
              {/* Confirming is what this screen is for, and it used to sit
                  below every step, every source and eleven assessment
                  questions — the least reachable thing on the page. It stays
                  with the teacher instead, the way the editing footer already
                  does. */}
              <div className="sticky bottom-0 z-10 flex flex-wrap gap-sm border-t border-rule-strong bg-[color-mix(in_srgb,var(--color-paper)_94%,transparent)] p-lg backdrop-blur-[0.75rem]">
                <Button type="submit" disabled={pending || beingPreparedAgain}>
                  {pending ? "Confirming…" : "Confirm lesson"}
                </Button>
                <Button kind="tertiary" type="button" onClick={() => onEdit()} disabled={pending}>
                  Edit lesson
                </Button>
                <Button kind="ghost" type="button" onClick={() => onRedraft()} disabled={pending}>
                  Re-draft with graspy
                </Button>
              </div>
                </>
  );
}
