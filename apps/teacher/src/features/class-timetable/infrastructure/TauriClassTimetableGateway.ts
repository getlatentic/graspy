import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import type { ClassTimetableGateway } from "../application/ClassTimetableGateway";
import { schoolDaySchema, type SchoolDay } from "../domain/schoolDay";
import {
  classTimetableSchema,
  nextTeachingSlotSchema,
  type ClassTimetableRequest,
  type NextTeachingSlot,
  type TeachingSlot,
} from "../domain/classTimetable";

export type NativeInvoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export class TauriClassTimetableGateway implements ClassTimetableGateway {
  constructor(private readonly nativeInvoke: NativeInvoke = invoke) {}

  async getTimetable(request: ClassTimetableRequest): Promise<TeachingSlot[]> {
    return classTimetableSchema.parse(
      await this.nativeInvoke("get_class_timetable", { request }),
    );
  }

  async setTimetable(request: ClassTimetableRequest): Promise<TeachingSlot[]> {
    return classTimetableSchema.parse(
      await this.nativeInvoke("set_class_timetable", { request }),
    );
  }

  async getNextSlot(context: {
    readonly academicSessionId: string;
    readonly academicPeriodId: string;
  }): Promise<NextTeachingSlot | null> {
    const answer = await this.nativeInvoke("get_next_teaching_slot", context);
    return answer === null ? null : nextTeachingSlotSchema.parse(answer);
  }

  async getTodaysClasses(context: {
    readonly academicSessionId: string;
    readonly academicPeriodId: string;
  }): Promise<string[]> {
    return z.array(z.string().min(1)).parse(
      await this.nativeInvoke("get_todays_classes", context),
    );
  }

  async getSchoolDay(): Promise<SchoolDay | null> {
    const answer = await this.nativeInvoke("get_school_day");
    return answer === null ? null : schoolDaySchema.parse(answer);
  }

  async setSchoolDay(day: SchoolDay): Promise<SchoolDay> {
    return schoolDaySchema.parse(await this.nativeInvoke("set_school_day", { day }));
  }
}
