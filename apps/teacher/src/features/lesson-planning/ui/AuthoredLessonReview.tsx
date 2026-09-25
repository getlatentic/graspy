import { Button } from "@carbon/react";
import { useState } from "react";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { LessonContent } from "../domain/lessonContent";
import type { LessonDraft } from "../domain/lessonPlanning";
import { EditableLesson } from "./EditableLesson";
import { PreparedLesson } from "./PreparedLesson";
import { displayTitle, editorActions, editorWorkspace, headingIntro, workspaceHeading } from "./lessonChrome";
import { FormActions } from "../../../ui/FormActions";
import { eyebrow } from "../../../ui/chrome";

interface Props {
  readonly academicContext: ActiveAcademicContext;
  readonly lesson: LessonDraft;
  readonly content: LessonContent;
  /** Told, rather than worked out from another layer's name for the action. */
  readonly saving: boolean;
  readonly error: string | null;
  readonly onBack: () => void;
  readonly onSave: (topic: string, content: LessonContent) => Promise<boolean>;
}

/**
 * A hand-written lesson, read and edited on one surface.
 *
 * It opens as the lesson, read — the teacher's first job is to see it, the way a
 * generated lesson is read before it is changed. Editing is a deliberate step
 * into the same layout made writable, so nothing here is a form beside a view.
 */
export function AuthoredLessonReview({
  academicContext,
  lesson,
  content,
  saving,
  error,
  onBack,
  onSave,
}: Props) {
  // Non-null while editing; it holds the working copy — topic and content —
  // seeded from what is saved each time editing starts, so a save elsewhere is
  // never overwritten. Nothing is written back until Save draft.
  const [draft, setDraft] = useState<{ topic: string; content: LessonContent } | null>(null);
  const canSave = draft !== null && draft.topic.trim().length > 0 && !saving;

  const save = async () => {
    if (draft === null || draft.topic.trim().length === 0) return;
    if (await onSave(draft.topic.trim(), draft.content)) setDraft(null);
  };

  return (
    <div className={editorWorkspace}>
      <header className={workspaceHeading}>
        <div className="w-full">
          <p className={eyebrow}>Lesson</p>
          {draft !== null ? (
            <input
              className="w-full bg-transparent border-0 border-b border-rule outline-none
                text-ink text-[1.75rem] font-light py-2xs focus:border-brand"
              aria-label="Lesson topic"
              placeholder="Name this lesson"
              value={draft.topic}
              onChange={(event) => setDraft({ ...draft, topic: event.currentTarget.value })}
            />
          ) : (
            <h1 className={displayTitle}>{lesson.topic || "Untitled lesson"}</h1>
          )}
          <p className={headingIntro}>
            {academicContext.assignment.displayName} · {academicContext.sessionLabel} ·{" "}
            {academicContext.period.name}
          </p>
        </div>
        {draft === null && lesson.curriculumUnit ? (
          <div className="grid gap-2xs border-s-2 border-accent ps-md">
            <span>Curriculum</span>
            <strong>{lesson.curriculumUnit.title}</strong>
          </div>
        ) : null}
      </header>

      {draft !== null ? (
        <>
          <EditableLesson
            content={draft.content}
            onChange={(content) => setDraft({ ...draft, content })}
          />
          {/* Saving is the only thing here that can fail, and it is asked for
              from this row, so the answer belongs beside it. */}
          <FormActions failure={error ? { title: "Lesson not saved", detail: error } : null}>
            <Button type="button" onClick={() => void save()} disabled={!canSave}>
              {saving ? "Saving…" : "Save draft"}
            </Button>
            <Button kind="ghost" type="button" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
          </FormActions>
        </>
      ) : (
        <>
          <PreparedLesson content={content} />
          <div className={editorActions}>
            <Button type="button" onClick={() => setDraft({ topic: lesson.topic, content })}>
              Edit lesson
            </Button>
            <Button kind="ghost" type="button" onClick={onBack}>
              Back to lessons
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
