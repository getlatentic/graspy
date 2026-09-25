import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  LessonPhotographReader,
  LessonPlanPhotograph,
} from "../application/LessonPhotographReader";

type NativeInvoke = <T>(command: string, arguments_?: Record<string, unknown>) => Promise<T>;
type NativeOpen = (options: {
  multiple: false;
  filters: { name: string; extensions: string[] }[];
}) => Promise<string | null>;

const nativeOpen: NativeOpen = (options) => open(options) as Promise<string | null>;

/**
 * The teacher picks the photograph in their own file dialog and graspy reads
 * that one path. It never goes looking through their pictures.
 */
export class TauriLessonPhotographReader implements LessonPhotographReader {
  private reading: string | null = null;

  constructor(
    private readonly nativeInvoke: NativeInvoke = invoke,
    private readonly openDialog: NativeOpen = nativeOpen,
    private readonly createRequestId: () => string = () => crypto.randomUUID(),
  ) {}

  canRead(): Promise<boolean> {
    return this.nativeInvoke<boolean>("can_read_a_lesson_plan_photograph");
  }

  async readPlan(): Promise<LessonPlanPhotograph | null> {
    const path = await this.openDialog({
      multiple: false,
      filters: [{ name: "Photographs", extensions: ["jpg", "jpeg", "png"] }],
    });
    if (path === null) return null;
    this.reading = this.createRequestId();
    try {
      return await this.nativeInvoke<LessonPlanPhotograph>("read_lesson_plan_photograph", {
        requestId: this.reading,
        path,
      });
    } finally {
      this.reading = null;
    }
  }

  async stopReading(): Promise<void> {
    if (this.reading === null) return;
    await this.nativeInvoke<void>("stop_reading_lesson_plan_photograph", {
      requestId: this.reading,
    });
  }
}
