import type { LessonContent } from "../../domain/lessonContent";
import type { LessonDraft, LessonLaunch } from "../../domain/lessonPlanning";

/** Writing a lesson: a new one, from a weekly plan or blank, or an existing one. */
export type EditorState =
  | {
      readonly kind: "new";
      readonly launch: LessonLaunch | null;
      readonly topic?: string;
      readonly pastedPlan?: string;
      readonly mode?: "structured" | "pasted";
    }
  | { readonly kind: "edit"; readonly lesson: LessonDraft };

/**
 * Which way of writing has the screen, when one does.
 *
 * One value rather than three flags. They are mutually exclusive — the start
 * choices, a blank page and the editor cannot be on screen together — and as
 * three booleans that was a rule every transition had to remember rather than a
 * fact about the type. Two of them set at once was representable, and only the
 * care taken in each setter kept it from happening.
 */
export type WritingMode =
  | { readonly kind: "choices" }
  | { readonly kind: "blank" }
  | { readonly kind: "editor"; readonly editor: EditorState };

/** Which way of writing a lesson is on screen. */
export type LessonWriting =
  | { readonly kind: "choices" }
  | {
      readonly kind: "blank";
      /** The scheme entry it is being written for, when it is being written for one. */
      readonly forEntry: {
        readonly topic: string;
        readonly subtopic: string | null;
        readonly schemeWeekId: string | null;
        readonly schemeEntryId: string | null;
      } | null;
    }
  | { readonly kind: "authored"; readonly lesson: LessonDraft; readonly content: LessonContent }
  | { readonly kind: "editor"; readonly editor: EditorState };

/** What the screen holds about writing, as this component needs to read it. */
export interface WritingSelection {
  readonly writing: WritingMode | null;
  readonly planning: {
    readonly topic: string;
    readonly subtopic: string | null;
    readonly schemeWeekId: string | null;
    readonly schemeEntryId: string | null;
  } | null;
}

/**
 * Which way of writing is on screen, or `null` when the week is.
 *
 * The order is the argument, and it lives here rather than at the call site so
 * the decision and the screens it decides between cannot drift apart: the start
 * choices, a blank page, a hand-written lesson read back, then the editor —
 * which wins over reading back, because a teacher who asked to edit is editing.
 */
export function lessonWritingFor(
  screen: WritingSelection,
  lesson: LessonDraft | null,
  authoredContent: LessonContent | null,
): LessonWriting | null {
  const writing = screen.writing;
  if (writing?.kind === "choices") return { kind: "choices" };
  if (writing?.kind === "blank") return { kind: "blank", forEntry: screen.planning };
  if (writing?.kind === "editor") return { kind: "editor", editor: writing.editor };
  return lesson && authoredContent ? { kind: "authored", lesson, content: authoredContent } : null;
}
