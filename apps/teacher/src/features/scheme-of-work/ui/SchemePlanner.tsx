import {
  Button,
  InlineNotification,
  Select,
  SelectItem,
  TextArea,
  TextInput,
} from "@carbon/react";
import { type FormEvent, useState } from "react";

import { SchemeEntryRow, type SchemeEntryLessonAction } from "./SchemeEntryRow";
import { schemeWeekKindSchema } from "../domain/schemeOfWork";
import { weekKindName } from "../domain/schemeTemplates";
import { StatusPill } from "../../../ui/StatusPill";

import {
  currentOrFirstTeachingWeek,
  type SaveSchemeEntryRequest,
  type SaveSchemeWeekRequest,
  type SchemeEntry,
  type SchemeOfWork,
  type SchemeWeek,
  type SchemeWeekKind,
} from "../domain/schemeOfWork";
import { entryRequestOf, fieldsOf, type SchemeEntryFields } from "../domain/schemeEntryFields";
import { eyebrow } from "../../../ui/chrome";

interface SchemePlannerProps {
  readonly scheme: SchemeOfWork;
  readonly pendingAction: string | null;
  readonly error: string | null;
  readonly onSaveWeek: (
    request: Omit<SaveSchemeWeekRequest, "context">,
  ) => Promise<boolean>;
  readonly onSaveEntry: (
    request: Omit<SaveSchemeEntryRequest, "context">,
  ) => Promise<boolean>;
  readonly onArchiveEntry: (entryId: string) => Promise<boolean>;
  readonly onMoveEntry: (entryId: string, targetWeekId: string) => Promise<boolean>;
  readonly onCreateLesson?: (schemeWeekId: string, schemeEntryId: string) => void;
  /** The way into the lesson a weekly plan already has. */
  readonly onOpenLesson?: (lessonId: string) => void;
}

export function SchemePlanner({
  scheme,
  pendingAction,
  error,
  onSaveWeek,
  onSaveEntry,
  onArchiveEntry,
  onMoveEntry,
  onCreateLesson,
  onOpenLesson,
}: SchemePlannerProps) {
  const [selectedWeekId, setSelectedWeekId] = useState(
    () => currentOrFirstTeachingWeek(scheme).id,
  );
  const selectedWeek =
    scheme.weeks.find(({ id }) => id === selectedWeekId) ?? scheme.weeks[0];

  return (
    <main className="mx-auto min-h-full w-[min(100%,76rem)] px-lg pt-xl pb-3xl">
      <header className="mb-xl flex flex-col items-start gap-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className={eyebrow}>Scheme of work</p>
          <h1 className="m-0 min-w-0 font-display font-extrabold text-ink [overflow-wrap:anywhere] tracking-[-0.035em] text-xl leading-display">{scheme.title}</h1>
          <p className="mt-sm mb-0 leading-body text-ink-secondary">
            {formatDate(scheme.calendar.startsOn)}–{formatDate(scheme.calendar.endsOn)}
          </p>
        </div>
        <div className="grid gap-2xs border-s-2 border-accent ps-md [&_small]:text-sm [&_small]:text-muted [&_span]:text-sm [&_span]:text-muted">
          <span>Curriculum</span>
          <strong>{scheme.curriculum.framework.name}</strong>
          <small>
            {scheme.curriculum.framework.authority} · {scheme.curriculum.framework.version}
          </small>
        </div>
      </header>

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Scheme not updated"
          subtitle={error}
        />
      ) : null}

      <div className="mt-xl grid min-w-0 grid-cols-[minmax(0,1fr)] gap-lg min-[60rem]:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)] min-[60rem]:items-start">
        <nav className="week-rail min-w-0 overflow-hidden border border-rule bg-paper [&>p]:m-0 [&>p]:border-b [&>p]:border-rule [&>p]:p-md [&>p]:text-sm [&>p]:font-bold [&>p]:text-muted" aria-label="Term weeks">
          <p>{scheme.weeks.length} calendar weeks</p>
          <ol className="m-0 flex list-none gap-0 overflow-x-auto p-0 min-[60rem]:grid min-[60rem]:overflow-visible">
            {scheme.weeks.map((week) => (
              <li className="flex-[0_0_10rem] min-[60rem]:min-w-0" key={week.id}>
                <button
                  type="button"
                  className="grid min-h-[5rem] w-full cursor-pointer gap-2xs border-0 border-e border-rule bg-paper px-md py-sm text-start text-ink-secondary hover:bg-paper-soft active:bg-rule disabled:cursor-not-allowed disabled:opacity-55 focus-visible:relative focus-visible:z-[var(--z-raised)] focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2 aria-[current=page]:bg-paper-accent aria-[current=page]:shadow-[inset_0_-2px_0_var(--color-accent)] min-[60rem]:border-e-0 min-[60rem]:border-b min-[60rem]:aria-[current=page]:shadow-[inset_2px_0_0_var(--color-accent)] [&>span]:font-extrabold [&>span]:text-ink [&>small]:truncate [&>small]:text-xs [&>em]:truncate [&>em]:text-xs [&>em]:not-italic [&>em]:text-muted"
                  aria-current={week.id === selectedWeek.id ? "page" : undefined}
                  onClick={() => setSelectedWeekId(week.id)}
                >
                  <span>Week {week.ordinal}</span>
                  <small>{week.title ?? weekKindName(week.kind)}</small>
                  <em>{week.entries.length} {week.entries.length === 1 ? "plan" : "plans"}</em>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <WeekWorkspace
          key={selectedWeek.id}
          week={selectedWeek}
          pendingAction={pendingAction}
          onSaveWeek={onSaveWeek}
          onSaveEntry={onSaveEntry}
          onArchiveEntry={onArchiveEntry}
          onMoveEntry={onMoveEntry}
          otherWeeks={scheme.weeks
            .filter((other) => other.kind === "teaching" && other.id !== selectedWeek.id)
            .map((other) => ({ id: other.id, ordinal: other.ordinal }))}
          onCreateLesson={onCreateLesson}
          onOpenLesson={onOpenLesson}
        />
      </div>
    </main>
  );
}

interface WeekWorkspaceProps {
  readonly week: SchemeWeek;
  readonly pendingAction: string | null;
  readonly onSaveWeek: SchemePlannerProps["onSaveWeek"];
  readonly onSaveEntry: SchemePlannerProps["onSaveEntry"];
  readonly onArchiveEntry: SchemePlannerProps["onArchiveEntry"];
  readonly onMoveEntry: SchemePlannerProps["onMoveEntry"];
  /** The other teaching weeks, which is where a subtopic can go and nowhere else. */
  readonly otherWeeks: readonly { readonly id: string; readonly ordinal: number }[];
  readonly onCreateLesson: SchemePlannerProps["onCreateLesson"];
  readonly onOpenLesson: SchemePlannerProps["onOpenLesson"];
}

function WeekWorkspace({
  week,
  pendingAction,
  onSaveWeek,
  onSaveEntry,
  onArchiveEntry,
  onMoveEntry,
  otherWeeks,
  onCreateLesson,
  onOpenLesson,
}: WeekWorkspaceProps) {
  const [kind, setKind] = useState<SchemeWeekKind>(week.kind);
  const [title, setTitle] = useState(week.title ?? "");
  // Closed, writing a new plan, or changing one that exists. Two states said
  // this — an entry and a flag — and every move set both, so a plan could be
  // held for editing with the form shut.
  const [entryForm, setEntryForm] = useState<{ readonly entry: SchemeEntry | null } | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<string | null>(null);
  // A plan that already has a lesson leads to it; only an unplanned one offers
  // to start one, because the library holds a plan to a single lesson.
  const lessonActionFor = (entry: SchemeEntry): SchemeEntryLessonAction => {
    const planned = entry.plannedLessonId;
    if (planned) {
      return onOpenLesson ? { kind: "open", onOpen: () => onOpenLesson(planned) } : { kind: "none" };
    }
    if (!onCreateLesson) return { kind: "none" };
    return { kind: "plan", onPlan: () => onCreateLesson(week.id, entry.id) };
  };
  const saveWeek = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSaveWeek({
      weekId: week.id,
      kind,
      title: title.trim() || null,
    });
  };

  return (
    <section className="week-settings-scope min-w-0 overflow-hidden border border-rule bg-paper" aria-labelledby="selected-week-title">
      <header className="flex flex-col items-start gap-md border-b border-rule p-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className={eyebrow}>Week {week.ordinal}</p>
          <h2 className="m-0 min-w-0 font-display font-extrabold text-ink [overflow-wrap:anywhere] tracking-[-0.035em] text-md leading-heading" id="selected-week-title">
            {formatDate(week.startsOn)}–{formatDate(week.endsOn)}
          </h2>
        </div>
        <StatusPill tone={week.kind === "teaching" ? "information" : "neutral"}>
          {weekKindName(week.kind)}
        </StatusPill>
      </header>

      <form className="grid grid-cols-[minmax(0,1fr)] gap-md border-b border-rule bg-paper-soft p-lg sm:grid-cols-[minmax(10rem,0.7fr)_minmax(12rem,1fr)_auto] sm:items-end [&_.cds--label]:font-bold [&_.cds--label]:text-ink-secondary [&_.cds--text-input]:border-b-rule-strong [&_.cds--text-input]:bg-paper-soft [&_.cds--text-input]:text-ink [&_.cds--select-input]:border-b-rule-strong [&_.cds--select-input]:bg-paper-soft [&_.cds--select-input]:text-ink [&_.cds--btn]:whitespace-nowrap [&_.cds--btn]:rounded-none" onSubmit={saveWeek}>
        <Select
          id={`week-${week.id}-kind`}
          labelText="Week type"
          value={kind}
          onChange={(event) => setKind(event.currentTarget.value as SchemeWeekKind)}
        >
          {schemeWeekKindSchema.options.map((option) => (
            <SelectItem key={option} value={option} text={weekKindName(option)} />
          ))}
        </Select>
        <TextInput
          id={`week-${week.id}-title`}
          labelText={kind === "teaching" ? "Week label (optional)" : "Week label"}
          required={kind !== "teaching"}
          maxLength={100}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        {/* The control that keeps what a teacher just typed carries the weight;
            the one that makes more work does not. It was the other way round. */}
        <Button
          type="submit"
          disabled={pendingAction === `save-week-${week.id}`}
        >
          Save week
        </Button>
      </form>

      {week.kind === "teaching" ? (
        <div className="p-lg">
          <div className="flex flex-col items-start gap-md sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="m-0 text-md font-extrabold text-ink">Weekly plan</h3>
              <p className="m-0 max-w-[65ch] leading-body text-ink-secondary">What pupils should learn and how you will teach it this week.</p>
            </div>
            {entryForm === null ? (
              <Button kind="tertiary" onClick={() => setEntryForm({ entry: null })}>
                Add weekly plan
              </Button>
            ) : null}
          </div>

          {entryForm ? (
            <SchemeEntryEditor
              entry={entryForm.entry}
              weekId={week.id}
              pending={pendingAction === `save-entry-${week.id}`}
              onCancel={() => setEntryForm(null)}
              onSave={async (request) => {
                const saved = await onSaveEntry(request);
                if (saved) setEntryForm(null);
                return saved;
              }}
            />
          ) : null}

          <div className="mt-lg grid gap-lg">
            {week.entries.length === 0 && entryForm === null ? (
              <p className="m-0 border border-dashed border-rule-strong px-lg py-xl text-center text-muted">
                No plan has been added for this teaching week.
              </p>
            ) : null}
            {week.entries.map((entry) => (
              <SchemeEntryRow
                key={entry.id}
                entry={entry}
                lessonAction={lessonActionFor(entry)}
                onEdit={() => setEntryForm({ entry })}
                archiving={{
                  armed: archiveCandidate === entry.id,
                  pending: pendingAction === `archive-entry-${entry.id}`,
                  onArm: () => setArchiveCandidate(entry.id),
                  onCancel: () => setArchiveCandidate(null),
                  onConfirm: () => void onArchiveEntry(entry.id),
                }}
                moving={{
                  weeks: otherWeeks,
                  pending: pendingAction === `move-entry-${entry.id}`,
                  onMove: (targetWeekId) => void onMoveEntry(entry.id, targetWeekId),
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid min-h-[18rem] content-center gap-sm p-xl">
          <h3 className="m-0 text-md font-extrabold text-ink">{week.title ?? weekKindName(week.kind)}</h3>
          <p className="m-0 max-w-[65ch] leading-body text-ink-secondary">This week remains visible in the term calendar but does not accept teaching plans.</p>
        </div>
      )}
    </section>
  );
}

interface SchemeEntryEditorProps {
  readonly entry: SchemeEntry | null;
  readonly weekId: string;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onSave: (
    request: Omit<SaveSchemeEntryRequest, "context">,
  ) => Promise<boolean>;
}

function SchemeEntryEditor({
  entry,
  weekId,
  pending,
  onCancel,
  onSave,
}: SchemeEntryEditorProps) {
  const [fields, setFields] = useState(() => fieldsOf(entry));
  const change = (field: keyof SchemeEntryFields) => (event: { currentTarget: { value: string } }) =>
    setFields((current) => ({ ...current, [field]: event.currentTarget.value }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSave(entryRequestOf(fields, entry, weekId));
  };
  return (
    <form className="mt-lg grid gap-lg border border-rule bg-paper-soft p-lg [&>header]:grid [&>header]:gap-xs [&_.cds--label]:font-bold [&_.cds--label]:text-ink-secondary [&_.cds--text-input]:border-b-rule-strong [&_.cds--text-input]:bg-paper-soft [&_.cds--text-input]:text-ink [&_.cds--text-area]:border-b-rule-strong [&_.cds--text-area]:bg-paper-soft [&_.cds--text-area]:text-ink [&_.cds--btn]:whitespace-nowrap [&_.cds--btn]:rounded-none" onSubmit={submit}>
      <header>
        <h4>{entry ? "Edit weekly plan" : "Add weekly plan"}</h4>
        <p>Use one line for each outcome, objective, assessment item or material.</p>
      </header>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-lg sm:grid-cols-2">
        <TextInput
          id={`entry-${weekId}-topic`}
          labelText="Topic"
          required
          maxLength={160}
          value={fields.topic}
          onChange={change("topic")}
        />
        <TextInput
          id={`entry-${weekId}-subtopic`}
          labelText="Subtopic (optional)"
          maxLength={160}
          value={fields.subtopic}
          onChange={change("subtopic")}
        />
        <TextInput
          className="sm:col-span-full"
          id={`entry-${weekId}-unit`}
          labelText="Curriculum topic"
          required
          maxLength={160}
          value={fields.curriculumUnit}
          onChange={change("curriculumUnit")}
        />
        <TextArea
          id={`entry-${weekId}-outcomes`}
          labelText="What pupils should learn"
          required
          rows={4}
          value={fields.curriculumOutcomes}
          onChange={change("curriculumOutcomes")}
        />
        <TextArea
          id={`entry-${weekId}-objectives`}
          labelText="Goals for the week"
          required
          rows={4}
          value={fields.objectives}
          onChange={change("objectives")}
        />
        <TextArea
          id={`entry-${weekId}-assessment`}
          labelText="How you will check learning"
          required
          rows={4}
          value={fields.assessment}
          onChange={change("assessment")}
        />
        <TextArea
          id={`entry-${weekId}-instructional-materials`}
          labelText="Instructional materials (optional)"
          rows={4}
          value={fields.instructionalMaterials}
          onChange={change("instructionalMaterials")}
        />
        <TextArea
          className="sm:col-span-full"
          id={`entry-${weekId}-notes`}
          labelText="Teacher notes (optional)"
          rows={3}
          value={fields.notes}
          onChange={change("notes")}
        />
      </div>
      <div className="flex flex-wrap gap-xs">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving plan…" : "Save weekly plan"}
        </Button>
        <Button type="button" kind="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}
