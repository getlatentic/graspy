import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  ImportedLessonPlan,
  LessonDocumentImporter,
} from "../application/LessonDocumentImporter";

type NativeInvoke = <T>(command: string, arguments_?: Record<string, unknown>) => Promise<T>;
type NativeOpen = (options: {
  multiple: false;
  filters: { name: string; extensions: string[] }[];
}) => Promise<string | null>;

const nativeOpen: NativeOpen = (options) =>
  open(options) as Promise<string | null>;

/**
 * The teacher picks the file in their own file dialog and graspy reads that
 * one path. It never goes looking through their documents.
 */
export class TauriLessonDocumentImporter implements LessonDocumentImporter {
  constructor(
    private readonly nativeInvoke: NativeInvoke = invoke,
    private readonly openDialog: NativeOpen = nativeOpen,
  ) {}

  async importPlan(): Promise<ImportedLessonPlan | null> {
    const path = await this.openDialog({
      multiple: false,
      filters: [{ name: "Lesson plans", extensions: ["docx", "pdf"] }],
    });
    if (path === null) return null;
    return this.nativeInvoke<ImportedLessonPlan>("import_lesson_plan_document", { path });
  }
}
