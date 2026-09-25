import { Button, InlineNotification, TextInput } from "@carbon/react";
import { type FormEvent, useState, type ReactNode } from "react";

import {
  assignmentsForSession,
  defaultPeriodNames,
  inferAcademicContext,
  type AcademicCalendarKind,
  type AcademicWorkspace,
  type AcademicWorkspaceSnapshot,
  type CreateAcademicSessionRequest,
  type SaveTeachingAssignmentRequest,
  type TeachingAssignment,
  type UpdateTeachingAssignmentRequest,
} from "../domain/academicWorkspace";
import { AcademicCalendarFields } from "./AcademicCalendarFields";
import { AssignmentFields, type AssignmentFieldValues } from "./AssignmentFields";
import type { CurriculumCatalogSnapshot } from "../../curriculum-catalog/domain/curriculumCatalog";
import { CurriculumCoursePicker } from "../../curriculum-catalog/ui/CurriculumLibrary";
import { ClassRegisterRow } from "./ClassRegisterRow";
import { eyebrow } from "../../../ui/chrome";

interface AcademicWorkspaceManagerProps {
  readonly snapshot: AcademicWorkspaceSnapshot;
  readonly workspace: AcademicWorkspace;
  readonly pendingAction: string | null;
  readonly error: string | null;
  readonly onAdd: (request: SaveTeachingAssignmentRequest) => Promise<boolean>;
  readonly onUpdate: (request: UpdateTeachingAssignmentRequest) => Promise<boolean>;
  readonly onArchive: (assignmentId: string) => Promise<boolean>;
  readonly onCreateSession: (request: CreateAcademicSessionRequest) => Promise<boolean>;
  /** Read by the course picker on each class, which is this screen's own job. */
  readonly catalog: CurriculumCatalogSnapshot;
  /**
   * The curriculum library, composed by whoever holds the catalogue.
   *
   * Four props travelled here only to be handed straight on, so this screen
   * had to know that installing a curriculum can fail and that it can be in
   * progress — neither of which is anything to do with classes and sessions.
   */
  readonly curriculumLibrary: ReactNode;
  readonly onAssignCurriculum: (request: {
    readonly assignmentId: string;
    readonly curriculumCourseId: string;
  }) => Promise<boolean>;
}

const emptyAssignment: AssignmentFieldValues = {
  subject: "",
  gradeLevelId: "",
  classSection: "",
};

export function AcademicWorkspaceManager({
  snapshot,
  workspace,
  pendingAction,
  error,
  onAdd,
  onUpdate,
  onArchive,
  onCreateSession,
  catalog,
  curriculumLibrary,
  onAssignCurriculum,
}: AcademicWorkspaceManagerProps) {
  /**
   * The one class being written, whether it is new or one that exists.
   *
   * Two states said this — a flag for adding and an assignment for editing —
   * and nothing stopped both: opening the add form and then editing a row put
   * two editors on the register at once, where saving one leaves the other's
   * typing with nowhere to go.
   */
  const [editor, setEditor] = useState<
    { readonly kind: "add" } | { readonly kind: "edit"; readonly assignment: TeachingAssignment } | null
  >(null);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [archiveCandidate, setArchiveCandidate] = useState<string | null>(null);
  const activeSession = workspace.sessions.find(
    ({ id }) => id === workspace.activeSessionId,
  );
  const assignments = assignmentsForSession(
    workspace,
    workspace.activeSessionId,
    true,
  );
  const gradeLevels = snapshot.gradeLevels.filter(
    ({ gradeSystemId }) => gradeSystemId === workspace.school.gradeSystemId,
  );

  return (
    <main className="mx-auto min-h-full w-[min(100%,76rem)] px-lg pt-xl pb-3xl">
      <header className="flex flex-col items-start gap-lg sm:flex-row sm:items-center sm:justify-between [&_.cds--btn]:rounded-none">
        <div>
          <p className={eyebrow}>Your classes</p>
          <h1 className="m-0 font-display font-extrabold tracking-[-0.035em] text-ink [overflow-wrap:anywhere] text-display leading-display">Classes and sessions</h1>
          <p className="mt-sm mb-0 max-w-[55ch] leading-body text-ink-secondary">
            Keep each subject and class attached to the session where it is taught.
          </p>
        </div>
        <Button kind="secondary" onClick={() => setNewSessionOpen(true)}>
          Start new session
        </Button>
      </header>

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Not updated"
          subtitle={error}
        />
      ) : null}

      {newSessionOpen ? (
        <NewSessionForm
          snapshot={snapshot}
          initialCalendarKind={activeSession?.calendarKind ?? "terms"}
          pending={pendingAction === "create-session"}
          onCancel={() => setNewSessionOpen(false)}
          onSubmit={async (request) => {
            const saved = await onCreateSession(request);
            if (saved) setNewSessionOpen(false);
            return saved;
          }}
        />
      ) : null}

      {curriculumLibrary}

      <section className="mt-xl overflow-hidden border border-rule bg-paper" aria-labelledby="class-register-title">
        <div className="flex flex-col items-start gap-lg border-b border-rule p-lg sm:flex-row sm:items-center sm:justify-between [&_.cds--btn]:rounded-none">
          <div>
            <p className={eyebrow}>Current session</p>
            <h2 className="m-0 font-display font-extrabold tracking-[-0.035em] text-ink [overflow-wrap:anywhere] text-xl leading-display" id="class-register-title">{activeSession?.label}</h2>
          </div>
          <Button kind="tertiary" onClick={() => setEditor({ kind: "add" })}>
            Add subject and class
          </Button>
        </div>

        {editor?.kind === "add" ? (
          <AssignmentEditor
            title="Add a subject and class"
            snapshot={snapshot}
            gradeLevels={gradeLevels}
            initialValues={emptyAssignment}
            submitLabel="Add class"
            pending={pendingAction === "add-assignment"}
            onCancel={() => setEditor(null)}
            onSubmit={async (values) => {
              const saved = await onAdd({
                academicSessionId: workspace.activeSessionId,
                ...values,
                classSection: values.classSection.trim() || null,
              });
              if (saved) setEditor(null);
              return saved;
            }}
          />
        ) : null}

        <div className="grid" role="list">
          {assignments.map((assignment) => (
            <ClassRegisterRow
              key={assignment.id}
              assignment={assignment}
              editor={
                editor?.kind === "edit" && editor.assignment.id === assignment.id ? (
                  <AssignmentEditor
                    title={`Edit ${assignment.displayName}`}
                    snapshot={snapshot}
                    gradeLevels={gradeLevels}
                    initialValues={{
                      subject: assignment.subject,
                      gradeLevelId: assignment.gradeLevelId,
                      classSection: assignment.classSection ?? "",
                    }}
                    submitLabel="Save changes"
                    pending={pendingAction === `update-${assignment.id}`}
                    onCancel={() => setEditor(null)}
                    onSubmit={async (values) => {
                      const saved = await onUpdate({
                        assignmentId: assignment.id,
                        ...values,
                        classSection: values.classSection.trim() || null,
                      });
                      if (saved) setEditor(null);
                      return saved;
                    }}
                  />
                ) : null
              }
              archiving={{
                armed: archiveCandidate === assignment.id,
                pending: pendingAction === `archive-${assignment.id}`,
                onEdit: () => setEditor({ kind: "edit", assignment }),
                onArm: () => setArchiveCandidate(assignment.id),
                onCancel: () => setArchiveCandidate(null),
                onConfirm: () => void onArchive(assignment.id),
              }}
              curriculumPicker={
                <CurriculumCoursePicker
                  assignment={assignment}
                  catalog={catalog}
                  pending={pendingAction === `curriculum-${assignment.id}`}
                  onAssign={(curriculumCourseId) =>
                    onAssignCurriculum({ assignmentId: assignment.id, curriculumCourseId })
                  }
                />
              }
            />
          ))}
        </div>
      </section>
    </main>
  );
}

interface AssignmentEditorProps {
  readonly title: string;
  readonly snapshot: AcademicWorkspaceSnapshot;
  readonly gradeLevels: AcademicWorkspaceSnapshot["gradeLevels"];
  readonly initialValues: AssignmentFieldValues;
  readonly submitLabel: string;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (values: AssignmentFieldValues) => Promise<boolean>;
}

function AssignmentEditor({
  title,
  snapshot,
  gradeLevels,
  initialValues,
  submitLabel,
  pending,
  onCancel,
  onSubmit,
}: AssignmentEditorProps) {
  const [values, setValues] = useState(initialValues);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit(values);
  };
  return (
    <form className="col-span-full grid w-full gap-lg border-s-2 border-accent ps-md [&_.cds--label]:font-bold [&_.cds--label]:text-ink-secondary [&_.cds--text-input]:min-h-[2.75rem] [&_.cds--text-input]:border-b-rule-strong [&_.cds--text-input]:bg-paper-soft [&_.cds--text-input]:text-ink [&_.cds--select-input]:min-h-[2.75rem] [&_.cds--select-input]:border-b-rule-strong [&_.cds--select-input]:bg-paper-soft [&_.cds--select-input]:text-ink" onSubmit={submit}>
      <h3 className="m-0 text-base font-extrabold text-ink">{title}</h3>
      <AssignmentFields
        values={values}
        subjects={snapshot.subjects}
        gradeLevels={gradeLevels}
        onChange={setValues}
      />
      <div className="flex flex-wrap gap-xs [&_.cds--btn]:rounded-none">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" kind="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface NewSessionFormProps {
  readonly snapshot: AcademicWorkspaceSnapshot;
  readonly pending: boolean;
  readonly initialCalendarKind: AcademicCalendarKind;
  readonly onCancel: () => void;
  readonly onSubmit: (request: CreateAcademicSessionRequest) => Promise<boolean>;
}

function NewSessionForm({
  snapshot,
  pending,
  initialCalendarKind,
  onCancel,
  onSubmit,
}: NewSessionFormProps) {
  const initialPeriodNames = defaultPeriodNames(initialCalendarKind);
  const [inferredContext] = useState(() =>
    inferAcademicContext(new Date(), initialPeriodNames.length),
  );
  const latestStartYear = Math.max(
    ...(snapshot.workspace?.sessions.map(({ startYear }) => startYear) ?? [2025]),
  );
  const proposedStartYear = Math.max(
    latestStartYear + 1,
    inferredContext.startYear,
  );
  const [startYear, setStartYear] = useState(String(proposedStartYear));
  const [calendarKind, setCalendarKind] =
    useState<AcademicCalendarKind>(initialCalendarKind);
  const [periodNames, setPeriodNames] = useState(initialPeriodNames);
  const [activePeriodOrdinal, setActivePeriodOrdinal] = useState(
    proposedStartYear === inferredContext.startYear
      ? inferredContext.activePeriodOrdinal
      : 1,
  );
  const [assignment, setAssignment] = useState<AssignmentFieldValues>(emptyAssignment);
  const gradeLevels = snapshot.gradeLevels.filter(
    ({ gradeSystemId }) => gradeSystemId === snapshot.workspace?.school.gradeSystemId,
  );
  const changeCalendar = (nextKind: AcademicCalendarKind) => {
    const nextNames = defaultPeriodNames(nextKind);
    setCalendarKind(nextKind);
    setPeriodNames(nextNames);
    setActivePeriodOrdinal(
      proposedStartYear === inferredContext.startYear
        ? inferAcademicContext(new Date(), nextNames.length).activePeriodOrdinal
        : 1,
    );
  };
  const changePeriodCount = (count: number) => {
    const defaults = defaultPeriodNames(calendarKind, count);
    setPeriodNames(
      Array.from({ length: count }, (_, index) => periodNames[index] ?? defaults[index]),
    );
    setActivePeriodOrdinal((current) => Math.min(current, count));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit({
      startYear: Number(startYear),
      calendarKind,
      periodNames,
      activePeriodOrdinal,
      subject: assignment.subject,
      gradeLevelId: assignment.gradeLevelId,
      classSection: assignment.classSection.trim() || null,
    });
  };
  return (
    <section className="mt-xl grid grid-cols-[minmax(0,1fr)] gap-xl border border-rule bg-paper p-lg min-[60rem]:grid-cols-[minmax(15rem,0.65fr)_minmax(28rem,1.35fr)] min-[60rem]:p-xl" aria-labelledby="new-session-title">
      <div>
        <p className={eyebrow}>Next teaching year</p>
        <h2 className="m-0 font-display font-extrabold tracking-[-0.035em] text-ink [overflow-wrap:anywhere] text-xl leading-display" id="new-session-title">Start a new academic session</h2>
        <p className="mt-sm mb-0 max-w-[55ch] leading-body text-ink-secondary">The current session stays available in your history.</p>
        <p className="mt-sm mb-0 max-w-[55ch] text-sm leading-body text-muted">
          The app suggests the current or next unsaved session from this
          device&apos;s date.
        </p>
      </div>
      <form className="grid gap-lg [&_.cds--label]:font-bold [&_.cds--label]:text-ink-secondary [&_.cds--text-input]:min-h-[2.75rem] [&_.cds--text-input]:border-b-rule-strong [&_.cds--text-input]:bg-paper-soft [&_.cds--text-input]:text-ink [&_.cds--select-input]:min-h-[2.75rem] [&_.cds--select-input]:border-b-rule-strong [&_.cds--select-input]:bg-paper-soft [&_.cds--select-input]:text-ink" onSubmit={submit}>
        <TextInput
          id="new-session-start-year"
          labelText="Academic session starts"
          inputMode="numeric"
          pattern="[0-9]{4}"
          required
          value={startYear}
          onChange={(event) => setStartYear(event.currentTarget.value)}
        />
        <AcademicCalendarFields
          idPrefix="new-session"
          calendarKind={calendarKind}
          periodNames={periodNames}
          activePeriodOrdinal={activePeriodOrdinal}
          onCalendarKindChange={changeCalendar}
          onPeriodCountChange={changePeriodCount}
          onPeriodNameChange={(index, name) =>
            setPeriodNames((current) =>
              current.map((periodName, periodIndex) =>
                periodIndex === index ? name : periodName,
              ),
            )
          }
          onActivePeriodChange={setActivePeriodOrdinal}
        />
        <AssignmentFields
          values={assignment}
          subjects={snapshot.subjects}
          gradeLevels={gradeLevels}
          onChange={setAssignment}
        />
        <div className="flex flex-wrap gap-xs [&_.cds--btn]:rounded-none">
          <Button type="submit" disabled={pending}>
            {pending ? "Starting session…" : "Start session"}
          </Button>
          <Button type="button" kind="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </section>
  );
}
