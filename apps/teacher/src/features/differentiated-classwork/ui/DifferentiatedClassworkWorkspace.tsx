import { Button, InlineLoading, InlineNotification } from "@carbon/react";

import { StatusPill } from "../../../ui/StatusPill";
import { useState } from "react";

import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import type { ClassworkExportGateway } from "../../document-export/application/ClassworkExportGateway";
import { ClassworkExportDialog } from "../../document-export/ui/ClassworkExportDialog";
import { readinessTiers } from "../../learner-evidence/domain/learnerState";
import { ClassworkText } from "../../classwork/ui/ClassworkText";
import type { DifferentiatedClassworkGateway } from "../application/DifferentiatedClassworkGateway";
import type {
  DifferentiatedClassworkGroup,
  DifferentiatedClassworkSection,
  DifferentiatedClassworkWorkspaceSnapshot,
} from "../domain/differentiatedClasswork";
import { useDifferentiatedClassworkGeneration } from "./useDifferentiatedClassworkGeneration";
import { appTaskStore } from "../../background-tasks/application/appTaskStore";
import type { BackgroundTaskStore } from "../../background-tasks/application/BackgroundTaskStore";
import { describeProgress, type BackgroundTask } from "../../background-tasks/domain/backgroundTask";
import { useWorkUnderWay } from "../../background-tasks/ui/useWorkUnderWay";

interface Props {
  readonly lessonId: string;
  readonly context: LessonContextRequest;
  readonly gateway: DifferentiatedClassworkGateway;
  readonly exportGateway?: ClassworkExportGateway;
  readonly onBack: () => void;
  /** The app's record of work under way, so this page never offers a second run. */
  readonly taskStore?: BackgroundTaskStore;
}

const sectionStateLabels = {
  pending: "Waiting",
  generating: "Creating",
  done: "Ready",
  failed: "Needs attention",
} as const;

const classworkLabels = {
  review: "Review",
  worked_example: "Worked example",
  practice: "Practice",
  solution: "Solution",
} as const;

export function DifferentiatedClassworkWorkspace({ lessonId, context, gateway, exportGateway, onBack, taskStore = appTaskStore }: Props) {
  const controller = useDifferentiatedClassworkGeneration(gateway, context, lessonId);
  // A run waiting its turn has not written a section yet, so the empty screen
  // would otherwise offer to create the same group classwork a second time.
  const underWay = useWorkUnderWay(taskStore, context, lessonId, "differentiated_classwork");
  if (controller.state.status === "loading") {
    return <div className="grid content-center justify-items-start gap-lg py-3xl"><InlineLoading description="Opening the group classwork" status="active" /></div>;
  }
  if (controller.state.status === "failed") {
    return (
      <div className="grid content-center justify-items-start gap-lg py-3xl">
        <InlineNotification kind="error" lowContrast hideCloseButton title="Group classwork unavailable" subtitle={controller.state.message} />
        <Button kind="tertiary" onClick={() => void controller.load()}>Try again</Button>
      </div>
    );
  }
  const { snapshot, actionError } = controller.state;
  return (
    <div className="min-w-0 text-ink [&_.cds--btn]:whitespace-nowrap">
      <header className="flex min-w-0 flex-col items-stretch justify-between gap-lg border-b border-rule bg-paper pb-lg min-[48rem]:flex-row min-[48rem]:items-center">
        <div>
          <p className="m-0 mb-xs font-extrabold text-accent">Group classwork</p>
          <h1 className="m-0 font-display font-extrabold tracking-[-0.025em] leading-display text-ink [overflow-wrap:anywhere] min-w-0">{snapshot.lesson.topic}</h1>
          <span className="mt-xs block text-muted">{snapshot.lesson.subject} · {snapshot.lesson.grade}</span>
        </div>
        <Button kind="ghost" onClick={onBack}>Back to the classwork</Button>
      </header>
      {actionError ? (
        <InlineNotification kind="error" lowContrast hideCloseButton title="Group classwork not updated" subtitle={actionError} />
      ) : null}
      {snapshot.run ? (
        <GroupClassworkComparison
          run={snapshot.run}
          onStopCreating={controller.cancel}
          onResume={controller.resume}
          onRetrySection={(sectionId) => void controller.retry(sectionId)}
          context={context}
          lessonId={lessonId}
          exportGateway={exportGateway}
        />
      ) : (
        <GroupClassworkEmpty snapshot={snapshot} onStart={controller.start} underWay={underWay} />
      )}
    </div>
  );
}

function GroupClassworkEmpty({ snapshot, onStart, underWay }: {
  readonly snapshot: DifferentiatedClassworkWorkspaceSnapshot;
  readonly onStart: () => Promise<void>;
  readonly underWay: BackgroundTask | null;
}) {
  return (
    <main className="grid min-h-[20rem] max-w-[60rem] content-center justify-items-start gap-lg p-[clamp(var(--spacing-lg),5vw,var(--spacing-2xl))] [&_h2]:m-0 [&_h2]:font-display [&_h2]:font-extrabold [&_h2]:tracking-[-0.025em] [&_h2]:leading-display [&_h2]:text-ink [&_p]:max-w-[62ch] [&_p]:text-base [&_p]:leading-body [&_p]:text-ink-secondary [&_li]:max-w-[62ch] [&_li]:text-base [&_li]:leading-body [&_li]:text-ink-secondary">
      <div>
        <h2>No group classwork yet.</h2>
        <p>Create one reviewable version for each teaching group from the original classwork and finished class results.</p>
      </div>
      {snapshot.readiness.blockers.length ? (
        <ul>{snapshot.readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
      ) : (
        <p>The original lesson stays beside every adjusted section so you can check exactly what changed.</p>
      )}
      {underWay === null ? (
        <Button disabled={!snapshot.readiness.canStart} onClick={() => void onStart()}>Create the group classwork</Button>
      ) : (
        <p>{describeProgress(underWay)}</p>
      )}
    </main>
  );
}

/**
 * The class's classwork beside each group's version of them, and the run that
 * is writing them.
 *
 * Takes the run rather than the snapshot it came from, so that a comparison
 * has something to compare is carried by the type rather than by the caller
 * remembering to check.
 */
function GroupClassworkComparison({ run, onStopCreating, onResume, onRetrySection, context, lessonId, exportGateway }: {
  readonly run: NonNullable<DifferentiatedClassworkWorkspaceSnapshot["run"]>;
  readonly onStopCreating: () => void;
  readonly onResume: () => void;
  readonly onRetrySection: (sectionId: string) => void;
  readonly context: LessonContextRequest;
  readonly lessonId: string;
  readonly exportGateway?: ClassworkExportGateway;
}) {
  const [groupId, setGroupId] = useState(run.groups[0].id);
  const group = run.groups.find(({ id }) => id === groupId) ?? run.groups[0];
  const [sectionId, setSectionId] = useState(group.sections[0].id);
  const section = group.sections.find(({ id }) => id === sectionId) ?? group.sections[0];
  const generating = run.groups.some((item) => item.sections.some(({ status }) => status === "generating"));
  const pending = run.groups.some((item) => item.sections.some(({ status }) => status === "pending"));
  const failed = run.groups.flatMap((item) => item.sections).find(({ status }) => status === "failed");
  const readyCount = run.groups.flatMap((item) => item.sections).filter(({ status }) => status === "done").length;
  const totalCount = run.groups.reduce((total, item) => total + item.sections.length, 0);
  const readyGroups = run.groups
    .filter((item) => item.sections.every(({ status }) => status === "done"))
    .map(({ id, name }) => ({ id, name }));

  const selectGroup = (next: DifferentiatedClassworkGroup) => {
    setGroupId(next.id);
    const sameSection = next.sections.find(({ sequence }) => sequence === section.sequence);
    setSectionId(sameSection?.id ?? next.sections[0].id);
  };

  return (
    <main className="grid min-w-0 grid-cols-[minmax(0,1fr)] min-[48rem]:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col border-b border-rule bg-paper min-[48rem]:sticky min-[48rem]:top-0 min-[48rem]:h-full min-[48rem]:overflow-y-auto min-[48rem]:border-b-0 min-[48rem]:border-e" aria-label="Group classwork progress">
        <header>
          <span className="text-sm leading-ui text-muted">{readyCount} of {totalCount} parts finished</span>
          <strong>{run.status === "complete" ? "Ready to review" : "Creating the group classwork"}</strong>
        </header>
        <p className="m-0 px-lg pb-md pt-0 text-sm leading-ui text-muted">
          Each version is built from your class results for this lesson. A group's
          readiness on each learning goal decides what changes.
        </p>
        <div className="grid border-y border-rule" role="tablist" aria-label="Teaching groups">
          {run.groups.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === group.id}
              onClick={() => selectGroup(item)}
            >
              <span>{item.name}</span>
              <small>{item.sections.filter(({ status }) => status === "done").length}/{item.sections.length} ready</small>
            </button>
          ))}
        </div>
        <nav aria-label={`Sections for ${group.name}`}>
          <ol className="m-0 list-none p-0 [&_small]:text-sm [&_small]:leading-ui [&_small]:text-muted [&_small[data-state=done]]:before:content-['✓_'] [&_small[data-state=failed]]:before:content-['!_']">
            {group.sections.map((item) => (
              <li key={item.id}>
                <button
                  className="grid min-h-[3.5rem] w-full min-w-0 content-center gap-2xs border-0 border-b border-rule bg-paper px-lg py-sm text-start text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-paper-accent active:bg-paper-accent active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0 disabled:cursor-not-allowed disabled:bg-paper-soft disabled:text-muted disabled:opacity-55 focus-visible:relative focus-visible:z-[var(--z-raised)] focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2 [@media(pointer:coarse)]:min-h-[3rem] grid-cols-[minmax(0,1fr)_auto] items-center [&>span]:min-w-0 [&>span]:truncate [&>span]:[overflow-wrap:anywhere] aria-[current=page]:bg-paper-accent aria-[current=page]:shadow-[inset_2px_0_0_var(--color-accent)]"
                  type="button"
                  aria-current={item.id === section.id ? "page" : undefined}
                  onClick={() => setSectionId(item.id)}
                >
                  <span>{item.sequence}. {item.stepTitle}</span>
                  <small data-state={item.status}>{sectionStateLabels[item.status]}</small>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="mt-auto grid gap-xs p-lg [&_p]:m-0 [&_p]:text-sm [&_p]:leading-ui [&_p]:text-muted">
          {generating ? <Button kind="tertiary" onClick={onStopCreating}>Stop creating</Button> : null}
          {!generating && failed ? <Button onClick={() => onRetrySection(failed.id)}>Try this part again</Button> : null}
          {!generating && !failed && pending ? <Button onClick={onResume}>Continue creating</Button> : null}
          {run.status === "cancelled" ? <p>Creation stopped. Ready sections are saved.</p> : null}
          {exportGateway && group.sections.every(({ status }) => status === "done") ? (
            <ClassworkExportDialog
              context={context}
              gateway={exportGateway}
              lessonId={lessonId}
              classworkSet="group"
              targets={readyGroups}
              initialTargetId={group.id}
            />
          ) : null}
        </div>
      </aside>

      <section className="min-w-0 p-lg min-[68rem]:px-[clamp(var(--spacing-xl),4vw,var(--spacing-2xl))] min-[68rem]:py-xl" aria-live="polite">
        <ComparisonHeader group={group} section={section} />
        {section.status === "done" ? (
          <BlockComparison section={section} groupName={group.name} />
        ) : section.status === "failed" ? (
          <div className="grid min-h-[20rem] content-center justify-items-start gap-lg p-[clamp(var(--spacing-lg),5vw,var(--spacing-2xl))] [&_h2]:m-0 [&_h2]:font-display [&_h2]:font-extrabold [&_h2]:tracking-[-0.025em] [&_h2]:leading-display [&_h2]:text-ink [&_p]:max-w-[62ch] [&_p]:text-base [&_p]:leading-body [&_p]:text-ink-secondary">
            <h2>This section needs attention.</h2>
            <p>{section.lastError}</p>
            {/* Retrying starts a run, and the backend holds one slot per
                lesson. Offering the button while a run is going asks the
                teacher to take an action that can only come back as an error
                about their own work. */}
            {generating || pending ? (
              <p>This section is waiting for the work already running.</p>
            ) : (
              <Button onClick={() => onRetrySection(section.id)}>Try this part again</Button>
            )}
          </div>
        ) : section.status === "generating" ? (
          <div className="grid min-h-[20rem] content-center justify-items-start gap-lg p-[clamp(var(--spacing-lg),5vw,var(--spacing-2xl))] [&_h2]:m-0 [&_h2]:font-display [&_h2]:font-extrabold [&_h2]:tracking-[-0.025em] [&_h2]:leading-display [&_h2]:text-ink [&_p]:max-w-[62ch] [&_p]:text-base [&_p]:leading-body [&_p]:text-ink-secondary"><InlineLoading description={`Creating this section for ${group.name}`} status="active" /></div>
        ) : (
          <div className="grid min-h-[20rem] content-center justify-items-start gap-lg p-[clamp(var(--spacing-lg),5vw,var(--spacing-2xl))] [&_h2]:m-0 [&_h2]:font-display [&_h2]:font-extrabold [&_h2]:tracking-[-0.025em] [&_h2]:leading-display [&_h2]:text-ink [&_p]:max-w-[62ch] [&_p]:text-base [&_p]:leading-body [&_p]:text-ink-secondary">
            <h2>This section is waiting.</h2>
            <p>Completed sections remain available while the rest are created.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function ComparisonHeader({ group, section }: {
  readonly group: DifferentiatedClassworkGroup;
  readonly section: DifferentiatedClassworkSection;
}) {
  const states = group.learnerState.filter((state) => section.baseSection.learningGoalNumbers.includes(state.learningGoalNumber));
  return (
    <header className="grid min-w-0 gap-lg border-b border-rule-strong pb-lg min-[48rem]:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
      <div>
        <p className="m-0 mb-xs font-extrabold text-accent">{group.name}</p>
        <h2 className="m-0 font-display font-extrabold tracking-[-0.025em] leading-display text-ink [overflow-wrap:anywhere] min-w-0">{section.baseSection.title}</h2>
        <span className="mt-xs block text-muted">{section.stepTitle}</span>
      </div>
      <div className="grid gap-sm border-s-2 border-accent ps-md [&_strong]:text-ink [&>div]:grid [&>div]:gap-2xs [&>div]:leading-ui [&>div]:text-ink-secondary [&>span]:grid [&>span]:gap-2xs [&>span]:leading-ui [&>span]:text-ink-secondary" aria-label="Class results used for this section">
        {states.map((state) => (
          <div key={state.learningGoalNumber}>
            <strong>{readinessTiers[state.masteryBand].name}</strong>
            <span>{state.mastery}</span>
            <span>Grouped here because {readinessTiers[state.masteryBand].placedBy}.</span>
            {state.commonMisunderstanding ? <span>Watch for: {state.commonMisunderstanding}</span> : null}
          </div>
        ))}
        {group.sessionSignals.interest ? <span>Interest: {group.sessionSignals.interest}</span> : null}
        {group.sessionSignals.lessonFeeling ? <span>End of lesson: {group.sessionSignals.lessonFeeling}</span> : null}
      </div>
    </header>
  );
}

function BlockComparison({ section, groupName }: {
  readonly section: DifferentiatedClassworkSection;
  readonly groupName: string;
}) {
  const adjustedByKind = new Map(section.blocks.map((block) => [block.kind, block]));
  return (
    <div className="grid">
      {section.baseSection.blocks.map((original) => {
        const adjusted = adjustedByKind.get(original.kind);
        if (!adjusted) return null;
        const changed = original.text.trim() !== adjusted.text.trim();
        return (
          <article className="border-b border-rule-strong py-xl [&>header]:mb-md [&>header]:flex [&>header]:items-center [&>header]:justify-between [&>header]:gap-md [&_h3]:m-0" key={original.id}>
            <header>
              <h3>{classworkLabels[original.kind]}</h3>
              <StatusPill tone={changed ? "information" : "neutral"}>{changed ? "Adjusted" : "Kept"}</StatusPill>
            </header>
            <div className="grid min-w-0 border border-rule min-[68rem]:grid-cols-2 [&>section]:min-w-0 [&>section]:bg-paper [&>section]:p-lg [&>section+section]:border-t [&>section+section]:border-rule-strong [&>section+section]:bg-paper-soft min-[68rem]:[&>section+section]:border-t-0 min-[68rem]:[&>section+section]:border-s [&_h4]:mt-0 [&_h4]:mb-md [&_h4]:text-sm [&_h4]:text-muted [&_.classwork-content]:max-w-[68ch] [&_.classwork-content]:text-ink-secondary">
              <section aria-label={`Original ${classworkLabels[original.kind]}`}>
                <h4>Original</h4>
                <ClassworkText text={original.text} />
              </section>
              <section aria-label={`${classworkLabels[original.kind]} for ${groupName}`}>
                <h4>{groupName}</h4>
                <ClassworkText text={adjusted.text} />
              </section>
            </div>
          </article>
        );
      })}
    </div>
  );
}
