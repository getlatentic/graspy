import { type FormEvent, type ReactNode, useState } from "react";

import { Button, InlineNotification, Select, SelectItem } from "@carbon/react";

import { StatusPill } from "../../../ui/StatusPill";

import { lessonChecks } from "../domain/lessonChecks";
import { preparationSource, type PreparationSource } from "../domain/preparationSource";
import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import { periodsForSession } from "../../academic-workspace/domain/academicWorkspace";
import { referenceSources, type LessonDraft, type MoveLessonDraftRequest } from "../domain/lessonPlanning";
import { DiscardLesson } from "./DiscardLesson";
import { LessonProgress } from "./LessonProgress";
import { LessonSourceChips } from "./LessonSourceChips";
import {
  AssessmentList,
  ReferencesSection,
  ReviewList,
  TeachingStepsList,
  reviewHeading,
} from "./LessonReviewSections";
import { describeProgress, type BackgroundTask } from "../../background-tasks/domain/backgroundTask";
import { eyebrow } from "../../../ui/chrome";

const preparationCallout =
  "flex items-center justify-between gap-lg border-s-[0.25rem] border-brand bg-paper-accent p-lg max-sm:flex-col max-sm:items-stretch";
const preparationResult = "mt-lg grid items-center gap-md";

export function LessonDetail({
  lesson,
  weekOrdinal,
  classworkWritten,
  onOpenClasswork,
  children,
}: {
  readonly lesson: LessonDraft;
  readonly weekOrdinal: number | null;
  /** Whether every part of this lesson's classwork is written. */
  readonly classworkWritten: boolean;
  /** Where the step a teacher is on leads, when it leads anywhere. */
  readonly onOpenClasswork?: (() => void) | null;
  /** The lesson's documents and where it leads, composed by whoever holds them. */
  readonly children: ReactNode;
}) {
  const source = referenceSources(lesson.references)[0] ?? null;
  const hasPlan = lesson.steps.length > 0;
  return (
    <article className="grid gap-xl">
      <header>
        {/* The status shares only the line it sits on. Placed beside the whole
            block it would hold its column down every line below, and the title,
            the week and the chips would each lose that width. */}
        <div className="flex items-start justify-between gap-md">
          <p className={`${eyebrow} min-w-0`}>
            {lesson.subtopic ? lesson.topic : "Lesson"}
          </p>
          <StatusPill tone={lesson.status === "confirmed" ? "positive" : "neutral"}>{lesson.status === "confirmed" ? "Confirmed" : "Draft"}</StatusPill>
        </div>
        <h2 className="m-0 font-display font-extrabold tracking-[-0.035em] text-ink [overflow-wrap:anywhere]">
          {lesson.subtopic ?? lesson.topic}
        </h2>
        {/* The heading above names the lesson and the class and term sit in
            the workspace chrome, so this line carries only what is the
            lesson's own: where it falls in the term. */}
        {weekOrdinal ? <p>Week {weekOrdinal}</p> : null}
        <LessonSourceChips
          objective={lesson.granularRecord?.plan.curriculumObjectives?.[0]?.statement ?? null}
          source={source}
        />
      </header>
      <LessonProgress
        status={lesson.status}
        hasPlan={hasPlan}
        classworkWritten={classworkWritten}
        onGoToNow={lesson.status === "confirmed" ? onOpenClasswork : null}
      />
      {children}
    </article>
  );
}

/** The lesson plan itself, in the order the plan a school reads carries it. */
export function LessonPlanPanel({ lesson }: { readonly lesson: LessonDraft }) {
  if (lesson.inputMode === "pasted") return <PastedPlanPanel lesson={lesson} />;
  return (
    <>
      <ReviewList title="Learning goals" values={lesson.learningGoals} />
      {lesson.steps.length ? <TeachingStepsList steps={lesson.steps} /> : null}
      {/* What the teacher brings and what the class already has are both short
          and both about the lesson before it starts, so they sit together. */}
      {lesson.instructionalMaterials.length || lesson.previousKnowledge.length ? (
        <div className="grid gap-lg border-b border-rule pb-lg sm:grid-cols-2">
          {lesson.instructionalMaterials.length ? (
            <ReviewList title="Instructional materials" values={lesson.instructionalMaterials} />
          ) : null}
          {lesson.previousKnowledge.length ? (
            <ReviewList title="Previous knowledge" values={lesson.previousKnowledge} />
          ) : null}
        </div>
      ) : null}
      {/* The questions are long-form, so they take the full width. */}
      {lesson.assessment.length ? <AssessmentList checks={lessonChecks(lesson)} /> : null}
      {lesson.assignment.length ? (
        <ReviewList title="Assignment" values={lesson.assignment} />
      ) : null}
      {lesson.references.length ? <ReferencesSection references={lesson.references} /> : null}
    </>
  );
}

/** A lesson still in the teacher's own pasted words, before graspy reads it apart. */
function PastedPlanPanel({ lesson }: { readonly lesson: LessonDraft }) {
  return (
    <section>
      <h3 className={reviewHeading}>Original lesson plan</h3>
      <pre className="m-0 whitespace-pre-wrap leading-body text-ink-secondary [font:inherit]">{lesson.rawPlan}</pre>
      {lesson.rawPlan ? (
        <p>Prepare this lesson, review every field, then confirm it.</p>
      ) : (
        <InlineNotification kind="error" lowContrast hideCloseButton title="Original lesson unavailable" subtitle="Edit this draft and paste the lesson plan again." />
      )}
    </section>
  );
}

/**
 * Where this lesson leads, and how to change what it was written from.
 *
 * These sat inside the plan panel, so opening the Note unmounted them and a
 * teacher reading the note had no way through to the classwork or the results
 * without going back. They belong to the lesson rather than to one of its
 * documents, so they sit under both.
 */
export function LessonNextSteps({
  lesson,
  academicContext,
  pendingAction,
  preparationUnderWay,
  onEdit,
  onPrepare,
  onMove,
  onDiscard,
  onOpenClasswork,
  onOpenEvidence,
}: {
  readonly lesson: LessonDraft;
  readonly academicContext: ActiveAcademicContext;
  readonly pendingAction: string | null;
  readonly preparationUnderWay: BackgroundTask | null;
  readonly onEdit: () => void;
  readonly onPrepare: () => void;
  readonly onMove: (request: Omit<MoveLessonDraftRequest, "sourceContext">) => Promise<boolean>;
  readonly onDiscard: () => void;
  readonly onOpenClasswork: () => void;
  readonly onOpenEvidence: () => void;
}) {
  const confirmed = lesson.status === "confirmed";
  // Whether the move panel is open is this control's own business: it changes
  // nothing else on the screen, and it used to travel from the workspace's
  // state hook through two components that only passed it along.
  const [moving, setMoving] = useState(false);
  return (
    <>
      {lesson.status === "draft" ? (
        <LessonPreparationAction
          underWay={preparationUnderWay}
          scheduled={lesson.schemeEntryId !== null}
          hasLearningGoals={lesson.learningGoals.length > 0}
          fromPastedPlan={lesson.inputMode === "pasted" && !!lesson.rawPlan}
          onTeachingWeek={onEdit}
          onPrepare={onPrepare}
        />
      ) : null}
      <div className="flex flex-wrap gap-sm">
        {confirmed ? <Button onClick={onOpenClasswork}>Open the classwork</Button> : null}
        {confirmed ? <Button kind="tertiary" onClick={onOpenEvidence}>Add class results</Button> : null}
        {/* This opens the form holding the topic and the plan text graspy built
            from — not the lesson it wrote. Both were called "Edit lesson", so a
            teacher reading a confirmed plan clicked it expecting to change what
            they were reading and got the source instead, with saving turning the
            lesson back into a draft. */}
        <Button kind="tertiary" onClick={onEdit}>Edit the starting plan</Button>
        {lesson.status === "draft" ? (
          <Button kind="ghost" onClick={() => setMoving((open) => !open)}>Move draft</Button>
        ) : null}
      </div>
      {lesson.status === "draft" ? (
        <DiscardLesson
          covers={lesson.subtopic ?? lesson.topic}
          pending={pendingAction === "discard-lesson"}
          onDiscard={onDiscard}
        />
      ) : null}
      {moving ? (
        <MoveLessonDraft
          lesson={lesson}
          academicContext={academicContext}
          pending={pendingAction === "move-draft"}
          onMove={onMove}
        />
      ) : null}
    </>
  );
}

/**
 * Work this lesson already has in hand, shown in place of an offer to start it.
 *
 * A teacher who set this going on another screen — or before closing the app —
 * gets told what is happening rather than a button that would queue the same
 * lesson twice.
 */
function WorkAlreadyUnderWay({ task }: { readonly task: BackgroundTask }) {
  return (
    <section className={preparationResult}>
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title={task.status === "queued" ? "Waiting its turn" : "Already being prepared"}
        subtitle={describeProgress(task)}
      />
    </section>
  );
}

const PREPARATION_INVITATIONS: Record<PreparationSource, string> = {
  pastedPlan:
    "graspy will structure the plan you pasted into learning goals, a teaching sequence, worked examples, practice and checks for your review.",
  scheduled:
    "Prepare the learning goals, teaching sequence, worked examples, practice, and checks for your review.",
  ownGoals:
    "graspy will match your learning goals to the installed source material, then prepare the teaching sequence, worked examples, practice and checks for your review.",
};

/** A draft with nothing to build from yet. */
function NothingToBuildFrom({ onTeachingWeek }: { readonly onTeachingWeek: () => void }) {
  return (
    <section className={preparationCallout}>
      <div>
        <h3 className={reviewHeading}>Say what your learners should be able to do</h3>
        <p className="m-0 mt-xs max-w-[56ch] leading-body text-ink-secondary">
          Write a learning goal or two and graspy will find matching source
          material and build the lesson around them. You can put this lesson on
          a teaching week instead, to use that week's curriculum.
        </p>
      </div>
      <Button kind="tertiary" onClick={onTeachingWeek}>
        Choose a teaching week
      </Button>
    </section>
  );
}

/** A draft with something to build from, and the offer to build it. */
function ReadyToBuild({
  source,
  onPrepare,
}: {
  readonly source: PreparationSource;
  readonly onPrepare: () => void;
}) {
  return (
    <section className={preparationCallout}>
      <div>
        <h3 className={reviewHeading}>Build the complete lesson</h3>
        <p className="m-0 mt-xs max-w-[56ch] leading-body text-ink-secondary">
          {PREPARATION_INVITATIONS[source]}
        </p>
      </div>
      <Button onClick={onPrepare}>Prepare lesson</Button>
    </section>
  );
}

/**
 * How this draft gets prepared: one place, whatever it is built from.
 *
 * A pasted plan used to carry its own copy of this inside the plan panel, so a
 * run in hand was reported twice once the actions moved out from under the
 * tabs.
 */
function LessonPreparationAction({
  underWay,
  onTeachingWeek,
  onPrepare,
  ...sources
}: {
  readonly underWay: BackgroundTask | null;
  readonly onTeachingWeek: () => void;
  readonly scheduled: boolean;
  readonly hasLearningGoals: boolean;
  readonly fromPastedPlan: boolean;
  readonly onPrepare: () => void;
}) {
  // Work under way is reported rather than offered again: a teacher who set
  // this going elsewhere should not be handed a button that queues it twice.
  if (underWay !== null) return <WorkAlreadyUnderWay task={underWay} />;
  const source = preparationSource(sources);
  return source === null ? (
    <NothingToBuildFrom onTeachingWeek={onTeachingWeek} />
  ) : (
    <ReadyToBuild source={source} onPrepare={onPrepare} />
  );
}

function MoveLessonDraft({ lesson, academicContext, pending, onMove }: { readonly lesson: LessonDraft; readonly academicContext: ActiveAcademicContext; readonly pending: boolean; readonly onMove: (request: Omit<MoveLessonDraftRequest, "sourceContext">) => Promise<boolean> }) {
  const assignments = academicContext.workspace.assignments;
  const [assignmentId, setAssignmentId] = useState(assignments.find(({ id }) => id !== academicContext.assignment.id)?.id ?? "");
  const selectedAssignment = assignments.find(({ id }) => id === assignmentId);
  const availablePeriods = periodsForSession(
    academicContext.workspace,
    selectedAssignment?.academicSessionId ?? academicContext.workspace.activeSessionId,
  );
  const [periodId, setPeriodId] = useState(() => {
    const initialAssignment = assignments.find(({ id }) => id !== academicContext.assignment.id);
    if (!initialAssignment || initialAssignment.academicSessionId === academicContext.workspace.activeSessionId) {
      return academicContext.period.id;
    }
    return periodsForSession(academicContext.workspace, initialAssignment.academicSessionId)[0]?.id ?? "";
  });
  const targetIsCurrent =
    selectedAssignment?.id === academicContext.assignment.id && periodId === academicContext.period.id;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAssignment) return;
    void onMove({
      lessonId: lesson.id,
      targetContext: { academicSessionId: selectedAssignment.academicSessionId, academicPeriodId: periodId, teachingAssignmentId: selectedAssignment.id },
      schemeWeekId: null,
      schemeEntryId: null,
    });
  };
  return (
    <form className="grid gap-lg border-t border-rule-strong pt-lg [&_.cds--select-input]:min-h-[2.75rem]" onSubmit={submit}>
      <h3 className="m-0 text-base text-ink">Move this draft</h3>
      <p className="m-0 mt-xs max-w-[65ch] leading-body text-ink-secondary">The lesson will be unscheduled in the target class and academic period. Confirmed versions cannot be moved.</p>
      <Select id="move-lesson-assignment" labelText="Subject and class" required value={assignmentId} onChange={(event) => {
        const nextAssignmentId = event.currentTarget.value;
        const nextAssignment = assignments.find(({ id }) => id === nextAssignmentId);
        setAssignmentId(nextAssignmentId);
        if (nextAssignment) {
          setPeriodId(
            nextAssignment.academicSessionId === academicContext.workspace.activeSessionId
              ? academicContext.period.id
              : periodsForSession(academicContext.workspace, nextAssignment.academicSessionId)[0]?.id ?? "",
          );
        }
      }}>
        <SelectItem value="" text="Choose a class" disabled />
        {assignments.map((assignment) => <SelectItem key={assignment.id} value={assignment.id} text={assignment.displayName} />)}
      </Select>
      <Select id="move-lesson-period" labelText="Academic period" value={periodId} onChange={(event) => setPeriodId(event.currentTarget.value)}>
        {availablePeriods.map((period) => <SelectItem key={period.id} value={period.id} text={period.name} />)}
      </Select>
      {targetIsCurrent ? <p className="m-0 mt-xs max-w-[65ch] leading-body text-ink-secondary">Choose a different class or academic period.</p> : null}
      <Button type="submit" disabled={pending || !selectedAssignment || !periodId || targetIsCurrent}>Move without weekly plan</Button>
    </form>
  );
}
