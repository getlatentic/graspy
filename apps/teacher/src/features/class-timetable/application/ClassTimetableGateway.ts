import type {
  ClassTimetableRequest,
  NextTeachingSlot,
  TeachingSlot,
} from "../domain/classTimetable";
import type { SchoolDay } from "../domain/schoolDay";

/** Where a class sits on the school week, and what that says about today. */
export interface ClassTimetableGateway {
  getTimetable(request: ClassTimetableRequest): Promise<TeachingSlot[]>;
  setTimetable(request: ClassTimetableRequest): Promise<TeachingSlot[]>;
  getNextSlot(context: {
    readonly academicSessionId: string;
    readonly academicPeriodId: string;
  }): Promise<NextTeachingSlot | null>;
  /** The classes taught today, in the order they come. */
  getTodaysClasses(context: {
    readonly academicSessionId: string;
    readonly academicPeriodId: string;
  }): Promise<string[]>;
  /** The school day, or null until a teacher has described theirs. */
  getSchoolDay(): Promise<SchoolDay | null>;
  setSchoolDay(day: SchoolDay): Promise<SchoolDay>;
}
