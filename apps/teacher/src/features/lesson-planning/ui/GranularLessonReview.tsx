import { Button, InlineNotification } from "@carbon/react";
import { type FormEvent, useCallback, useState } from "react";

import { updateGranularPlan } from "../domain/granularLessonEditing";
import type {
  GranularLessonRecord,
} from "../domain/granularLesson";
import { sourcesOfCitedExcerpts, type LessonDraft } from "../domain/lessonPlanning";
import { LessonSourceChips } from "./LessonSourceChips";
import { LessonAsWritten, PreparedNotice } from "./LessonAsWritten";
import { LessonEditingForm } from "./LessonEditingForm";
import { eyebrow } from "../../../ui/chrome";

interface Props {
  readonly lesson: LessonDraft;
  readonly weekOrdinal?: number | null;
  readonly record: GranularLessonRecord;
  readonly originalPlan: string | null;
  readonly pendingAction: string | null;
  /// Set when graspy is writing this lesson again. What is on screen is the
  /// last saved version, and it is about to be replaced.
  readonly beingPreparedAgain: boolean;
  readonly error: string | null;
  /// Absent when the week's lesson list is beside this review, where a button
  /// back to a list already on screen is one more thing to read and nothing to
  /// do.
  readonly onBack?: () => void;
  readonly onSave: (lessonId: string, record: GranularLessonRecord) => Promise<boolean>;
  readonly onConfirm: (lessonId: string) => Promise<boolean>;
  readonly onRedraft: (lessonId: string) => void;
}

// The design's header chips: what the lesson answers to — its curriculum and
// its source — at a glance, before any of the content.

export function GranularLessonReview({
  lesson,
  weekOrdinal,
  record: initialRecord,
  originalPlan,
  pendingAction,
  beingPreparedAgain,
  error,
  onBack,
  onSave,
  onConfirm,
  onRedraft,
}: Props) {
  const [record, setRecord] = useState(initialRecord);
  const [savedRecord, setSavedRecord] = useState(initialRecord);
  const plan = record.plan;
  const pending = pendingAction !== null;
  const hasUnsavedChanges = record !== savedRecord;
  const source = sourcesOfCitedExcerpts(plan.references)[0] ?? null;
  // Stable across renders so a memoised step row is not invalidated by every
  // keystroke elsewhere in the lesson.
  const changePlan = useCallback(
    (update: (value: GranularLessonRecord["plan"]) => GranularLessonRecord["plan"]) =>
      setRecord((current) => updateGranularPlan(current, update)),
    [],
  );

  const save = async () => {
    const saved = await onSave(lesson.id, record);
    if (saved) setSavedRecord(record);
    return saved;
  };
  const [editing, setEditing] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasUnsavedChanges && !(await save())) return;
    await onConfirm(lesson.id);
  };

  return (
    <div className="mx-auto min-h-full w-[min(100%,48rem)] px-lg pt-xl pb-3xl">
      <header className="mb-xl flex flex-col items-start gap-lg px-lg sm:flex-row sm:justify-between">
        <div>
          <p className={eyebrow}>{plan.subtopic ? plan.topic : "Review lesson"}</p>
          <h1 className="m-0 max-w-[40ch] font-display text-display font-light leading-display tracking-[-0.01em] text-ink">{plan.subtopic ?? plan.topic}</h1>
          {/* The heading already names the lesson and the class and term sit
              in the workspace chrome above, so this line carries only what is
              the lesson's own: where it falls in the term. */}
          {weekOrdinal ? <p>Week {weekOrdinal}</p> : null}
          <LessonSourceChips
            objective={plan.curriculumObjectives[0]?.statement ?? null}
            source={source}
          />
        </div>
        {onBack ? (
          <Button kind="ghost" onClick={onBack} disabled={pending}>
            Back to lessons
          </Button>
        ) : null}
      </header>

      {editing ? null : <PreparedNotice beingPreparedAgain={beingPreparedAgain} />}

      <AnswersChecked report={lesson.answerReport} />

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Lesson not updated"
          subtitle={error}
        />
      ) : null}

      <form className="grid min-w-0 border-y border-rule-strong bg-paper" onSubmit={(event) => void submit(event)}>
        {originalPlan ? (
          <aside className="min-w-0 border-b border-rule-strong bg-paper-soft min-[60rem]:border-b-rule" aria-label="Your original lesson plan">
            <div className="flex flex-wrap items-start gap-y-md gap-x-2xl">
              {/* Open: a lesson prepared from a pasted plan is judged against
                  that plan, so the teacher's own words stay on screen beside
                  what graspy made of them. */}
              <details className="grid min-w-0 content-start gap-2xs" open>
                <summary className="min-h-[2.75rem] cursor-pointer">Your original lesson plan</summary>
                <pre className="mt-md mb-0 max-h-[28rem] overflow-auto whitespace-pre-wrap leading-body text-ink-secondary [font:inherit] [overflow-wrap:anywhere]">{originalPlan}</pre>
              </details>
            </div>
          </aside>
        ) : null}

        <main className="grid min-w-0">
          {editing ? null : (
            <LessonAsWritten
              plan={plan}
              pending={pending}
              beingPreparedAgain={beingPreparedAgain}
              onEdit={() => setEditing(true)}
              onRedraft={() => onRedraft(lesson.id)}
            />
          )}
          <LessonEditingForm
            plan={plan}
            editing={editing}
            pending={pending}
            sourceFigures={record.sourceEvidenceSnapshot.figures}
            changePlan={changePlan}
          />

          {editing ? (
          <footer className="flex flex-col items-start gap-md border-t border-rule-strong bg-[color-mix(in_srgb,var(--color-paper)_94%,transparent)] p-lg backdrop-blur-[0.75rem]">
            <div className="flex flex-wrap gap-sm">
              <Button type="submit" disabled={pending || beingPreparedAgain}>
                {pendingAction === "confirm-granular-lesson"
                  ? "Confirming lesson…"
                  : "Confirm lesson"}
              </Button>
              <Button
                type="button"
                kind="tertiary"
                disabled={pending || !hasUnsavedChanges}
                onClick={() => void save()}
              >
                {pendingAction === "save-granular-lesson"
                  ? "Saving changes…"
                  : "Save changes"}
              </Button>
            </div>
            <p className="m-0 max-w-[60ch] text-sm leading-body text-muted">Confirmation stores an immutable version for lesson instructionalMaterials and class results.</p>
          </footer>
          ) : null}
        </main>
      </form>
    </div>
  );
}

/**
 * What graspy's own checks made of this lesson's answers.
 *
 * A teacher is told, not stopped: they are the one who can fix a wrong answer,
 * and refusing to save the lesson would take that away. How many answers
 * nothing could read is said too, because "graspy checked these" is only worth
 * anything beside how much it did not check.
 */
function AnswersChecked({
  report,
}: {
  readonly report: LessonDraft["answerReport"];
}) {
  if (!report) return null;
  const total = report.checked + report.unchecked + report.wrong.length;
  if (total === 0) return null;
  const unread =
    report.unchecked > 0
      ? ` graspy could not check ${report.unchecked} of the ${total} answers in this lesson.`
      : "";
  if (report.wrong.length === 0) {
    return unread ? (
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="Check the answers"
        subtitle={`The answers graspy could check are right.${unread}`}
      />
    ) : null;
  }
  return (
    <InlineNotification
      kind="warning"
      lowContrast
      hideCloseButton
      title={
        report.wrong.length === 1
          ? "One answer here looks wrong"
          : `${report.wrong.length} answers here look wrong`
      }
      subtitle={report.wrong
        .map((wrong) => `${wrong.question} — ${wrong.problem}`)
        .join(" ")
        .concat(unread)}
    />
  );
}
