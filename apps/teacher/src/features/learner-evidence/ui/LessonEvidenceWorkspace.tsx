import {
  Button,
  InlineLoading,
  InlineNotification,
  NumberInput,
  Select,
  SelectItem,
  TextArea,
  TextInput,
} from "@carbon/react";
import { useState } from "react";

import { StatusPill } from "../../../ui/StatusPill";
import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import type { LessonEvidenceGateway } from "../application/LessonEvidenceGateway";
import {
  editableGroups,
  evidenceValidation,
  type EvidenceEntryInput,
  type EvidenceGroupInput,
  type LessonEvidenceWorkspaceSnapshot,
  type SaveLessonEvidenceRequest,
} from "../domain/lessonEvidence";
import {
  confidenceScaleLabels,
  difficultyScaleLabels,
  interestScaleLabels,
  lessonFeelingScaleLabels,
} from "../domain/learnerState";
import { useLessonEvidence } from "./useLessonEvidence";

interface Props {
  readonly lessonId: string;
  readonly context: LessonContextRequest;
  readonly gateway: LessonEvidenceGateway;
  readonly onBack: () => void;
}

export function LessonEvidenceWorkspace({ lessonId, context, gateway, onBack }: Props) {
  const controller = useLessonEvidence(gateway, context, lessonId);
  const state = controller.state;
  if (state.status === "loading") {
    return (
      <div className="grid content-center gap-lg py-3xl">
        <InlineLoading description="Opening class results" status="active" />
      </div>
    );
  }
  if (state.status === "failed") {
    return (
      <div className="grid content-center gap-lg py-3xl">
        <InlineNotification kind="error" lowContrast hideCloseButton title="Class results unavailable" subtitle={state.message} />
        <Button kind="tertiary" onClick={() => void controller.load()}>Try again</Button>
      </div>
    );
  }
  const { snapshot, saving, actionError } = state;
  return (
    <div className="min-w-0">
      <header className="mb-xl flex flex-col items-start gap-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="m-0 mb-xs font-extrabold text-accent">Class results</p>
          <h1 className="m-0 font-display text-display font-extrabold leading-display tracking-[-0.035em] text-ink [overflow-wrap:anywhere]">{snapshot.lesson.topic}</h1>
          <p>Confirmed lesson</p>
        </div>
        <div className="flex flex-wrap items-center gap-sm">
          {snapshot.evidence ? <StatusPill tone={snapshot.evidence.status === "complete" ? "positive" : "neutral"}>{snapshot.evidence.status === "complete" ? "Finished" : "Draft saved"}</StatusPill> : null}
          <Button kind="ghost" disabled={saving} onClick={onBack}>Back to the lesson</Button>
        </div>
      </header>
      {actionError ? <InlineNotification kind="error" lowContrast hideCloseButton title="Class results not saved" subtitle={actionError} /> : null}
      <EvidenceOnTheChosenGoal
        snapshot={snapshot}
        saving={saving}
        onBack={onBack}
        onSave={controller.save}
      />
    </div>
  );
}

/**
 * Keeps the teacher on the goal they were marking.
 *
 * The editor is keyed on the lesson version and the saved revision, so every
 * save replaces it with a fresh form. Holding the chosen goal out here is what
 * stops that returning the teacher to the first goal each time they save.
 */
function EvidenceOnTheChosenGoal({ snapshot, saving, onBack, onSave }: {
  readonly snapshot: LessonEvidenceWorkspaceSnapshot;
  readonly saving: boolean;
  readonly onBack: () => void;
  readonly onSave: (
    input: Omit<SaveLessonEvidenceRequest, "context" | "lessonId">,
  ) => Promise<boolean>;
}) {
  const [activeGoal, setActiveGoal] = useState(1);
  return (
      <EvidenceEditor
        key={`${snapshot.lesson.lessonVersionId}:${snapshot.evidence?.revision ?? 0}`}
        snapshot={snapshot}
        saving={saving}
        onBack={onBack}
        onSave={onSave}
        activeGoal={activeGoal}
        onActiveGoalChange={setActiveGoal}
      />
  );
}

function EvidenceEditor({ snapshot, saving, onBack, onSave, activeGoal, onActiveGoalChange }: {
  readonly snapshot: LessonEvidenceWorkspaceSnapshot;
  readonly saving: boolean;
  readonly onBack: () => void;
  readonly onSave: (
    input: Omit<SaveLessonEvidenceRequest, "context" | "lessonId">,
  ) => Promise<boolean>;
  readonly activeGoal: number;
  readonly onActiveGoalChange: (goal: number) => void;
}) {
  const [groups, setGroups] = useState<EvidenceGroupInput[]>(() => editableGroups(snapshot));
  const [validationError, setValidationError] = useState<string | null>(null);
  const started = snapshot.evidence !== null;

  const save = async (status: "draft" | "complete", nextGoal: number | null, returnToLessons = false) => {
    const error = evidenceValidation(groups, status === "complete");
    if (error) { setValidationError(error); return; }
    setValidationError(null);
    const saved = await onSave({
      lessonVersionId: snapshot.lesson.lessonVersionId,
      expectedRevision: snapshot.evidence?.revision ?? null,
      status,
      groups,
    });
    if (saved && nextGoal !== null) onActiveGoalChange(nextGoal);
    if (saved && returnToLessons) onBack();
  };

  if (!started) {
    return (
      <main className="grid max-w-[52rem] gap-xl border-y border-rule-strong py-xl">
        <div className="[&_h2]:m-0 [&_h2]:font-display [&_h2]:font-extrabold [&_h2]:tracking-[-0.035em] [&_h2]:text-ink [&_p]:mt-sm [&_p]:mb-0 [&_p]:max-w-[65ch] [&_p]:text-ink-secondary">
          <h2>Name the three groups you teach differently.</h2>
          <p>Use names that make sense in your classroom. You can change them before finishing these results.</p>
        </div>
        <GroupNameFields groups={groups} onChange={setGroups} />
        {validationError ? <p className="m-0 mb-md font-bold text-error" role="alert">{validationError}</p> : null}
        <div className="flex flex-wrap items-center gap-sm [&_.cds--btn]:whitespace-nowrap">
          <Button disabled={saving} onClick={() => void save("draft", 1)}>{saving ? "Saving…" : "Start recording"}</Button>
          <Button kind="ghost" onClick={onBack}>Cancel</Button>
        </div>
      </main>
    );
  }

  const goal = snapshot.lesson.learningGoals[activeGoal - 1];
  const lastGoal = activeGoal === snapshot.lesson.learningGoals.length;
  const finished = snapshot.evidence?.status === "complete";
  return (
    <main className="grid min-w-0 border-y border-rule-strong bg-paper min-[60rem]:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
      <aside className="evidence-index min-w-0 border-b border-rule py-lg min-[60rem]:sticky min-[60rem]:top-lg min-[60rem]:max-h-[calc(100%-2*var(--spacing-lg))] min-[60rem]:self-start min-[60rem]:overflow-y-auto min-[60rem]:border-b-0 min-[60rem]:border-e [&>div:first-child]:px-md [&_h2]:m-0 [&_h2]:font-display [&_h2]:font-extrabold [&_h2]:tracking-[-0.035em] [&_h2]:text-ink">
        <div>
          <p className="m-0 mb-xs font-extrabold text-accent">Learning goals</p>
          <h2>{activeGoal} of {snapshot.lesson.learningGoals.length}</h2>
        </div>
        <ol className="my-lg mx-0 list-none border-t border-rule p-0 [&_li]:border-b [&_li]:border-rule">
          {snapshot.lesson.learningGoals.map((learningGoal, index) => {
            const goalNumber = index + 1;
            const complete = groups.every((group) => group.entries[index]?.questionsCorrect !== null);
            return (
              <li key={learningGoal}>
                <button className="grid min-h-[4.5rem] w-full cursor-pointer grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-sm border-0 bg-transparent p-md text-start text-ink focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2 aria-[current=step]:bg-paper-accent aria-[current=step]:shadow-[inset_2px_0_0_var(--color-accent)] [&>span:first-child]:font-technical [&>span:first-child]:tabular-nums [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:font-bold [&>span:nth-child(2)]:[overflow-wrap:anywhere] [&_small]:whitespace-nowrap [&_small]:font-technical [&_small]:tabular-nums [&_small]:text-muted" type="button" aria-current={goalNumber === activeGoal ? "step" : undefined} onClick={() => onActiveGoalChange(goalNumber)}>
                  <span>{goalNumber}</span>
                  <span>{learningGoal}</span>
                  <small>{complete ? "Scored" : "Not scored"}</small>
                </button>
              </li>
            );
          })}
        </ol>
        <section className="px-md [&>h3]:m-0 [&>h3]:mb-md [&>h3:not(:first-child)]:mt-xl [&>p]:-mt-sm [&>p]:mb-md [&>p]:leading-body [&>p]:text-muted">
          <h3>Teaching groups</h3>
          <GroupNameFields groups={groups} onChange={setGroups} compact />
          <h3>Overall lesson signals</h3>
          <p>Optional ratings for each group across the whole lesson.</p>
          <GroupSignalFields groups={groups} onChange={setGroups} />
        </section>
      </aside>

      <section className="min-w-0 px-md pt-xl pb-2xl min-[60rem]:px-[clamp(var(--spacing-xl),5vw,var(--spacing-3xl))] [&>header]:max-w-[62rem] [&>header]:border-b [&>header]:border-rule [&>header]:pb-xl [&>header>p:last-child]:mt-sm [&>header>p:last-child]:mb-0 [&>header>p:last-child]:max-w-[65ch] [&>header>p:last-child]:text-ink-secondary [&_h2]:m-0 [&_h2]:max-w-[28ch] [&_h2]:font-display [&_h2]:text-display [&_h2]:font-extrabold [&_h2]:leading-display [&_h2]:tracking-[-0.035em] [&_h2]:text-ink [&_h2]:[overflow-wrap:anywhere]" aria-labelledby="active-evidence-goal">
        <header>
          <p className="m-0 mb-xs font-extrabold text-accent">Learning goal {activeGoal}</p>
          <h2 id="active-evidence-goal">{goal}</h2>
          <p>Record what the exit test showed for each group.</p>
        </header>
        <div className="my-xl grid border-t border-rule">
          {groups.map((group, groupIndex) => (
            <GroupResult
              key={group.id ?? group.position}
              group={group}
              entry={group.entries[activeGoal - 1]}
              goalNumber={activeGoal}
              onChange={(entry) => setGroups((current) => current.map((item, index) => index === groupIndex
                ? { ...item, entries: item.entries.map((saved, entryIndex) => entryIndex === activeGoal - 1 ? entry : saved) }
                : item))}
            />
          ))}
        </div>
        {validationError ? <p className="m-0 mb-md font-bold text-error" role="alert">{validationError}</p> : null}
        <div className="flex flex-wrap items-center gap-sm [&_.cds--btn]:whitespace-nowrap">
          {finished ? (
            <Button disabled={saving} onClick={() => void save("complete", lastGoal ? null : activeGoal + 1)}>{saving ? "Saving…" : lastGoal ? "Save changes" : "Save and next goal"}</Button>
          ) : lastGoal ? (
            <Button disabled={saving} onClick={() => void save("complete", null)}>{saving ? "Finishing…" : "Finish results"}</Button>
          ) : (
            <Button disabled={saving} onClick={() => void save("draft", activeGoal + 1)}>{saving ? "Saving…" : "Save and next goal"}</Button>
          )}
          <Button kind="tertiary" disabled={saving} onClick={() => void save(finished ? "complete" : "draft", null, true)}>{finished ? "Save and return to lessons" : "Save for later"}</Button>
        </div>
      </section>
    </main>
  );
}

function GroupSignalFields({ groups, onChange }: {
  readonly groups: EvidenceGroupInput[];
  readonly onChange: (groups: EvidenceGroupInput[]) => void;
}) {
  return (
    <div className="grid gap-sm [&_strong]:[overflow-wrap:anywhere] [&>div]:grid [&>div]:gap-sm [&>div]:border-t [&>div]:border-rule [&>div]:pt-md">
      {groups.map((group, index) => (
        <div key={group.position}>
          <strong>{group.name}</strong>
          <RatingSelect
            id={`interest-${group.position}`}
            label="Interest"
            value={group.interestScore}
            kind="interest"
            onChange={(interestScore) => onChange(groups.map((item, itemIndex) =>
              itemIndex === index ? { ...item, interestScore } : item))}
          />
          <RatingSelect
            id={`lesson-feeling-${group.position}`}
            label="Understanding at the end"
            value={group.lessonFeelingScore}
            kind="lessonFeeling"
            onChange={(lessonFeelingScore) => onChange(groups.map((item, itemIndex) =>
              itemIndex === index ? { ...item, lessonFeelingScore } : item))}
          />
        </div>
      ))}
    </div>
  );
}

function GroupNameFields({ groups, onChange, compact = false }: {
  readonly groups: EvidenceGroupInput[];
  readonly onChange: (groups: EvidenceGroupInput[]) => void;
  readonly compact?: boolean;
}) {
  return (
    <div className={compact ? "evidence-name-fields evidence-name-fields--compact" : "evidence-name-fields"}>
      {groups.map((group, index) => (
        <TextInput key={group.position} id={`evidence-group-${group.position}`} labelText={`Group ${group.position}`} maxLength={80} value={group.name}
          onChange={(event) => onChange(groups.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.currentTarget.value } : item))} />
      ))}
    </div>
  );
}

function GroupResult({ group, entry, goalNumber, onChange }: {
  readonly group: EvidenceGroupInput;
  readonly entry: EvidenceEntryInput;
  readonly goalNumber: number;
  readonly onChange: (entry: EvidenceEntryInput) => void;
}) {
  const setNumber = (field: "questionsCorrect" | "questionsTotal", value: string | number) => {
    const parsed = value === "" || Number.isNaN(Number(value)) ? null : Number(value);
    onChange({ ...entry, [field]: parsed });
  };
  return (
    <fieldset className="evidence-group-result m-0 grid min-w-0 gap-lg border-0 border-b border-rule px-0 py-xl min-[75rem]:grid-cols-[minmax(9rem,0.7fr)_minmax(14rem,1fr)_minmax(18rem,1.4fr)] min-[75rem]:items-start [&>legend]:m-0 [&>legend]:p-0 [&>legend]:text-lg [&>legend]:font-extrabold [&>legend]:text-ink min-[75rem]:[&>legend]:col-start-1 min-[75rem]:[&>.cds--form-item]:col-start-3">
      <legend>{group.name}</legend>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-end gap-sm min-[22rem]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[75rem]:col-start-2 [&>span]:min-h-[3rem] [&>span]:content-center [&>span]:whitespace-nowrap [&>span]:text-muted max-[22rem]:[&>span]:min-h-0">
        <NumberInput id={`correct-${goalNumber}-${group.position}`} label="Correct" min={0} max={1000} allowEmpty value={entry.questionsCorrect ?? ""} onChange={(_event, state) => setNumber("questionsCorrect", state.value)} />
        <span aria-hidden="true">out of</span>
        <NumberInput id={`total-${goalNumber}-${group.position}`} label="Total" min={1} max={1000} allowEmpty value={entry.questionsTotal ?? ""} onChange={(_event, state) => setNumber("questionsTotal", state.value)} />
      </div>
      <TextArea id={`note-${goalNumber}-${group.position}`} labelText="Common misunderstanding (optional)" maxLength={500} rows={3} value={entry.misunderstandingNote ?? ""}
        onChange={(event) => onChange({ ...entry, misunderstandingNote: event.currentTarget.value || null })} />
      <div className="grid min-w-0 gap-md sm:grid-cols-2 min-[75rem]:col-span-full min-[75rem]:col-start-2">
        <RatingSelect id={`confidence-${goalNumber}-${group.position}`} label="Confidence (optional)" value={entry.confidenceScore} kind="confidence" onChange={(confidenceScore) => onChange({ ...entry, confidenceScore })} />
        <RatingSelect id={`difficulty-${goalNumber}-${group.position}`} label="Difficulty (optional)" value={entry.difficultyScore} kind="difficulty" onChange={(difficultyScore) => onChange({ ...entry, difficultyScore })} />
      </div>
    </fieldset>
  );
}

const ratingLabels = {
  confidence: confidenceScaleLabels,
  difficulty: difficultyScaleLabels,
  interest: interestScaleLabels,
  lessonFeeling: lessonFeelingScaleLabels,
} as const;

function RatingSelect({ id, label, value, kind, onChange }: { readonly id: string; readonly label: string; readonly value: number | null; readonly kind: keyof typeof ratingLabels; readonly onChange: (value: number | null) => void }) {
  return (
    <Select id={id} labelText={label} value={value?.toString() ?? ""} onChange={(event) => onChange(event.currentTarget.value ? Number(event.currentTarget.value) : null)}>
      <SelectItem value="" text="Not recorded" />
      {ratingLabels[kind].map((text, index) => <SelectItem key={text} value={(index + 1).toString()} text={`${index + 1} · ${text}`} />)}
    </Select>
  );
}
