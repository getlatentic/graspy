import { Button } from "@carbon/react";
import { useState } from "react";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { LessonContent } from "../domain/lessonContent";
import { emptyLessonContent } from "../domain/lessonContentEditing";
import { EditableLesson } from "./EditableLesson";
import { editorWorkspace, workspaceHeading } from "./lessonChrome";
import { FormActions } from "../../../ui/FormActions";
import { eyebrow } from "../../../ui/chrome";

interface Props {
  readonly academicContext: ActiveAcademicContext;
  readonly pending: boolean;
  readonly error: string | null;
  /** A lesson written for a scheme entry is already named by the scheme. */
  readonly initialTopic?: string;
  readonly onCancel: () => void;
  readonly onSave: (topic: string, content: LessonContent) => Promise<boolean>;
}

/**
 * Writing a lesson from a blank page.
 *
 * The teacher names the lesson, then builds it on the same surface a prepared
 * lesson is read on — goals, timed steps, checks — so writing one feels like
 * writing a lesson, not filling a form. Once saved it is read and re-edited on
 * that surface too (AuthoredLessonReview); this is only the empty start.
 */
export function NewAuthoredLesson({
  academicContext,
  pending,
  error,
  initialTopic,
  onCancel,
  onSave,
}: Props) {
  const [topic, setTopic] = useState(initialTopic ?? "");
  const [content, setContent] = useState<LessonContent>(emptyLessonContent);
  const canSave = topic.trim().length > 0 && !pending;

  const save = async () => {
    if (!canSave) return;
    await onSave(topic.trim(), content);
  };

  return (
    <div className={editorWorkspace}>
      <header className={workspaceHeading}>
        <div className="w-full">
          <p className={eyebrow}>New lesson</p>
          <input
            className="w-full bg-transparent border-0 border-b border-rule outline-none
              text-ink text-[1.75rem] font-light py-2xs focus:border-brand"
            aria-label="Lesson topic"
            placeholder="Name this lesson"
            value={topic}
            onChange={(event) => setTopic(event.currentTarget.value)}
          />
          <p className="mt-sm">
            {academicContext.assignment.displayName} · {academicContext.sessionLabel} ·{" "}
            {academicContext.period.name}
          </p>
        </div>
      </header>

      <EditableLesson content={content} onChange={setContent} />

      <FormActions failure={error ? { title: "Lesson not saved", detail: error } : null}>
        <Button type="button" onClick={() => void save()} disabled={!canSave}>
          {pending ? "Saving…" : "Save draft"}
        </Button>
        <Button kind="ghost" type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </FormActions>
    </div>
  );
}
