import { classCardAction, termStandingLabel, type TeachingAssignment } from "../domain/academicWorkspace";
import { splitAssignment } from "./assignmentLabel";
import {
  card,
  cardClass,
  cardField,
  cardFieldLabel,
  cardHead,
  cardIcon,
  cardOpen,
  cardSubject,
} from "./workspaceCards";

/**
 * One class, as both screens that list classes show it.
 *
 * They drew this twice and drifted: one carried the next lesson and the other
 * did not, so whichever screen a teacher started on decided what they were
 * told. Drawn once, the two screens can differ in what they are for without
 * differing in what a class is.
 */
export function ClassCard({
  assignment,
  termName,
  onOpen,
  onPlanTerm,
}: {
  readonly assignment: TeachingAssignment;
  readonly termName: string;
  readonly onOpen: (assignmentId: string) => void;
  readonly onPlanTerm: (assignmentId: string) => void;
}) {
  const { subject, classLabel } = splitAssignment(assignment.displayName);
  const action = classCardAction(assignment);

  return (
    <article className={card}>
      <div className={cardHead}>
        <div>
          <p className={cardClass}>{classLabel}</p>
          <p className={cardSubject}>
            {subject} · {termName}
          </p>
        </div>
        <span className={cardIcon} aria-hidden="true">
          <svg viewBox="0 0 32 32" width="18" height="18" fill="currentColor">
            <path d="M26,4H6A2,2,0,0,0,4,6V26a2,2,0,0,0,2,2H26a2,2,0,0,0,2-2V6A2,2,0,0,0,26,4Zm0,2v6H6V6ZM16,26V14H26V26Zm-2,0H6V14h8Z" />
          </svg>
        </span>
      </div>

      <p className="m-0 flex items-baseline gap-sm">
        <span className="text-[1.5rem] leading-none text-success">
          {assignment.lessonsReady}/{assignment.lessonsTotal}
        </span>
        <span className="text-sm text-muted">Lessons ready</span>
      </p>

      {assignment.currentWeek ? (
        <div className={cardField}>
          <p className={cardFieldLabel}>{termStandingLabel(assignment.currentWeek)}</p>
          {assignment.currentWeek.title ? (
            <p className="m-0 text-ink-secondary [overflow-wrap:anywhere]">
              {assignment.currentWeek.title}
            </p>
          ) : null}
        </div>
      ) : (
        <div className={cardField}>
          <p className="m-0 text-sm text-muted">No scheme adopted yet</p>
        </div>
      )}

      {assignment.nextLesson ? (
        <div className={cardField}>
          <p className={cardFieldLabel}>Next lesson</p>
          <p className="m-0 text-ink-secondary [overflow-wrap:anywhere]">
            {assignment.nextLesson.topic}
            {assignment.nextLesson.subtopic ? ` · ${assignment.nextLesson.subtopic}` : ""}
          </p>
        </div>
      ) : null}

      <button
        type="button"
        className={`${cardOpen} w-full`}
        onClick={() =>
          action.kind === "planTerm" ? onPlanTerm(assignment.id) : onOpen(assignment.id)
        }
      >
        {action.label}
        <svg viewBox="0 0 32 32" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M18 6l-1.43 1.393L24.15 15H4v2h20.15l-7.58 7.573L18 26l10-10z" />
        </svg>
      </button>
    </article>
  );
}
