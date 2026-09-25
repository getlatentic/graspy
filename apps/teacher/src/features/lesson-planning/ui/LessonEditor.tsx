import { type FormEvent, useState } from "react";
import { Button, Select, SelectItem, TextInput } from "@carbon/react";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import { schemeEntryLabel, type LessonDraft, type LessonInputMode, type LessonSchemeEntryOption, type SaveLessonDraftRequest } from "../domain/lessonPlanning";
import {
  emptyEditableStep,
  isStartedStep,
  toLessonStepInput,
  type EditableStep,
} from "./lessonStepDraft";
import { StructuredLessonFields } from "./StructuredLessonFields";
import { displayTitle, editorWorkspace, headingIntro, workspaceHeading } from "./lessonChrome";
import { eyebrow } from "../../../ui/chrome";
import { draftRequestOf } from "../domain/lessonDraftRequest";
import { PastedPlanFields } from "./PastedPlanFields";
import { useBringingInAPlan, type WaysToBringInAPlan } from "./useBringingInAPlan";
import { FormActions } from "../../../ui/FormActions";

interface LessonEditorProps {
  readonly academicContext: ActiveAcademicContext;
  readonly lesson: LessonDraft | null;
  readonly schemeEntry: LessonSchemeEntryOption | null | undefined;
  readonly availableSchemeEntries: LessonSchemeEntryOption[];
  readonly pending: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onSave: (
    request: Omit<SaveLessonDraftRequest, "context">,
    andPrepare: boolean,
  ) => Promise<boolean>;
}

export function LessonEditor({
  academicContext,
  lesson,
  initialTopic,
  initialPastedPlan,
  initialInputMode,
  schemeEntry,
  availableSchemeEntries,
  pending,
  error,
  onCancel,
  onSave,
  bringingIn: ways,
}: LessonEditorProps & {
  readonly initialTopic?: string;
  readonly initialPastedPlan?: string;
  readonly initialInputMode?: LessonInputMode;
  readonly bringingIn: WaysToBringInAPlan;
}) {
  // How the lesson gets made is chosen at the start (LessonStartChooser), not
  // re-picked here, so the mode comes in from the route the teacher took.
  const inputMode: LessonInputMode =
    lesson?.inputMode ?? initialInputMode ?? (initialPastedPlan ? "pasted" : "structured");
  const [topic, setTopic] = useState(
    lesson?.topic ?? schemeEntry?.topic ?? initialTopic ?? "",
  );
  const [subtopic, setSubtopic] = useState(
    lesson?.subtopic ?? schemeEntry?.subtopic ?? "",
  );
  const [rawPlan, setRawPlan] = useState(lesson?.rawPlan ?? initialPastedPlan ?? "");
  // A file and a photograph both land the words in the same box a paste lands
  // in, so the teacher reads and edits them before anything is built from them.
  const broughtIn = useBringingInAPlan(ways, setRawPlan);
  const [learningGoals, setLearningGoals] = useState(
    lesson?.learningGoals.join("\n") ?? schemeEntry?.learningGoals.join("\n") ?? "",
  );
  const [instructionalMaterials, setInstructionalMaterials] = useState(
    lesson?.instructionalMaterials.join("\n") ?? schemeEntry?.instructionalMaterials.join("\n") ?? "",
  );
  const [previousKnowledge, setPreviousKnowledge] = useState(
    lesson?.previousKnowledge.join("\n") ?? "",
  );
  const [assessment, setAssessment] = useState(
    lesson?.assessment.join("\n") ?? schemeEntry?.assessment.join("\n") ?? "",
  );
  const [assignment, setAssignment] = useState(lesson?.assignment.join("\n") ?? "");
  const [references, setReferences] = useState(lesson?.references.join("\n") ?? "");
  const [schemeEntryId, setSchemeEntryId] = useState(
    lesson?.schemeEntryId ?? schemeEntry?.entryId ?? "",
  );
  const selectedSchemeEntry = availableSchemeEntries.find(
    ({ entryId }) => entryId === schemeEntryId,
  );
  const [steps, setSteps] = useState<EditableStep[]>(() =>
    lesson?.steps.length
      ? lesson.steps.map((step) => ({
          title: step.title,
          teacherActivity: step.teacherActivity,
          learnerActivity: step.learnerActivity,
          durationMinutes: step.durationMinutes?.toString() ?? "",
        }))
      : [emptyEditableStep()],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const andPrepare =
      (event.nativeEvent as SubmitEvent).submitter?.dataset.intent === "prepare";
    void onSave(
      draftRequestOf(
        {
          lessonId: lesson?.id ?? null,
          schemeWeekId: selectedSchemeEntry?.weekId ?? null,
          schemeEntryId: selectedSchemeEntry?.entryId ?? null,
          inputMode,
        },
        {
          topic,
          subtopic,
          rawPlan,
          learningGoals,
          instructionalMaterials,
          previousKnowledge,
          assessment,
          assignment,
          references,
        },
        steps.filter(isStartedStep).map(toLessonStepInput),
      ),
      andPrepare,
    );
  };

  return (
    <div className={editorWorkspace}>
      <header className={workspaceHeading}>
        <div>
          <p className={eyebrow}>{lesson ? "Edit the starting plan" : "New lesson"}</p>
          <h1 className={displayTitle}>{topic || "Plan this lesson"}</h1>
          <p className={headingIntro}>{academicContext.assignment.displayName} · {academicContext.sessionLabel} · {academicContext.period.name}</p>
        </div>
        {selectedSchemeEntry ? (
          <div className="grid gap-2xs border-s-2 border-accent ps-md">
            <span>Week {selectedSchemeEntry.weekOrdinal}</span>
            <strong>{selectedSchemeEntry.curriculumUnit.title}</strong>
          </div>
        ) : null}
      </header>

      <form className="grid gap-xl [&_.cds--text-input]:min-h-[2.75rem] border-y border-rule-strong bg-paper p-lg min-[60rem]:p-xl" onSubmit={submit}>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-lg sm:grid-cols-2">
          <TextInput
            id="lesson-topic"
            labelText="Lesson topic"
            required
            maxLength={160}
            value={topic}
            onChange={(event) => setTopic(event.currentTarget.value)}
          />
          <TextInput
            id="lesson-subtopic"
            labelText="Subtopic (optional)"
            maxLength={160}
            value={subtopic}
            onChange={(event) => setSubtopic(event.currentTarget.value)}
          />
          <div className="col-span-full grid max-w-[40rem] gap-xs">
            <Select
              id="lesson-weekly-plan"
              labelText="Weekly plan (optional)"
              value={schemeEntryId}
              onChange={(event) => setSchemeEntryId(event.currentTarget.value)}
            >
              <SelectItem value="" text="Unscheduled" />
              {availableSchemeEntries.map((entry) => (
                <SelectItem
                  key={entry.entryId}
                  value={entry.entryId}
                  text={`${schemeEntryLabel(entry).headline} · ${schemeEntryLabel(entry).context}`}
                />
              ))}
            </Select>
            <p>
              {selectedSchemeEntry
                ? "This lesson will stay connected to the selected weekly plan."
                : "Pick a week now, or later."}
            </p>
          </div>
        </div>

        {inputMode === "pasted" ? (
          <PastedPlanFields
            text={rawPlan}
            onTextChange={setRawPlan}
            pending={pending}
            bringingIn={broughtIn}
            offering={broughtIn.offering}
            settingUpPhotographs={
              ways.photographReadingSetup?.(broughtIn.checkAgain) ?? null
            }
          />
        ) : (
          <StructuredLessonFields
            learningGoals={learningGoals}
            instructionalMaterials={instructionalMaterials}
            previousKnowledge={previousKnowledge}
            assessment={assessment}
            assignment={assignment}
            references={references}
            steps={steps}
            onLearningGoalsChange={setLearningGoals}
            onInstructionalMaterialsChange={setInstructionalMaterials}
            onPreviousKnowledgeChange={setPreviousKnowledge}
            onAssessmentChange={setAssessment}
            onAssignmentChange={setAssignment}
            onReferencesChange={setReferences}
            onStepsChange={setSteps}
          />
        )}

        <FormActions failure={error ? { title: "Draft not saved", detail: error } : null}>
          <Button type="submit" data-intent="prepare" disabled={pending}>
            {pending ? "Starting…" : "Write it with graspy"}
          </Button>
          <Button type="submit" kind="tertiary" data-intent="draft" disabled={pending}>
            {pending ? "Saving…" : "Save without writing"}
          </Button>
          <Button type="button" kind="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </FormActions>
      </form>
    </div>
  );
}
