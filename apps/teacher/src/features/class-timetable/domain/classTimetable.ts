import { z } from "zod";

export const weekdaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export const teachingSlotSchema = z.object({
  weekday: weekdaySchema,
  period: z.number().int().min(1).max(12),
});

export const nextTeachingSlotSchema = z.object({
  teachingAssignmentId: z.string().min(1),
  className: z.string().min(1),
  subject: z.string().min(1),
  weekday: weekdaySchema,
  period: z.number().int().positive(),
  isToday: z.boolean(),
  weekOrdinal: z.number().int().positive().nullable(),
  lesson: z
    .object({
      lessonId: z.string().min(1),
      topic: z.string().min(1),
      subtopic: z.string().nullable(),
      readyToTeach: z.boolean(),
    })
    .nullable(),
});

export const classTimetableSchema = z.array(teachingSlotSchema);

export type Weekday = z.infer<typeof weekdaySchema>;
export type TeachingSlot = z.infer<typeof teachingSlotSchema>;
export type NextTeachingSlot = z.infer<typeof nextTeachingSlotSchema>;

export interface ClassTimetableRequest {
  readonly academicSessionId: string;
  readonly academicPeriodId: string;
  readonly teachingAssignmentId: string;
  readonly slots: readonly TeachingSlot[];
}

/** Every day of the week, in order, for a screen that offers the choice. */
export const EVERY_WEEKDAY: readonly Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/**
 * The periods of one school day.
 *
 * A timetable repeats every week, so one week is the whole of it. Eight is a
 * school day — the twelve the column allows is a guard against a typo reaching
 * the library, not a day anyone teaches.
 */
export const SCHOOL_DAY_PERIODS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];

const WEEKDAY_NAMES: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function weekdayName(weekday: Weekday): string {
  return WEEKDAY_NAMES[weekday];
}

/** Whether this class is taught in that period, as the grid asks it. */
export function isTaught(
  slots: readonly TeachingSlot[],
  weekday: Weekday,
  period: number,
): boolean {
  return slots.some((slot) => slot.weekday === weekday && slot.period === period);
}

/** The timetable with one period turned on or off. */
export function toggleSlot(
  slots: readonly TeachingSlot[],
  weekday: Weekday,
  period: number,
): TeachingSlot[] {
  if (isTaught(slots, weekday, period)) {
    return slots.filter((slot) => !(slot.weekday === weekday && slot.period === period));
  }
  return [...slots, { weekday, period }];
}

/**
 * How many periods a week this class gets, said the way a teacher says it.
 *
 * A timetable with nothing on it says so rather than reading "0 periods a
 * week", which sounds like a fact about the class rather than about the app.
 */
export function timetableSummary(slots: readonly TeachingSlot[]): string {
  if (slots.length === 0) return "No periods set";
  return `${slots.length} ${slots.length === 1 ? "period" : "periods"} a week`;
}

/**
 * When the next class is, in the words a teacher would use for it.
 *
 * "Today" is worth saying and "Monday" is worth saying; "Monday period 3" on a
 * Monday would leave a teacher working out whether that is now or a week away.
 */
export function whenNext(slot: NextTeachingSlot): string {
  const day = slot.isToday ? "Today" : weekdayName(slot.weekday);
  return `${day} · Period ${slot.period}`;
}

/**
 * What the next class is for, when graspy knows.
 *
 * The lesson comes from the week's plan. Without a plan, or without a lesson
 * written against it, there is nothing to name and the screen says what is
 * missing instead of naming a topic that does not exist.
 */
export function whatNext(slot: NextTeachingSlot): string {
  if (!slot.lesson) return "No lesson planned for this week yet";
  const { topic, subtopic, readyToTeach } = slot.lesson;
  const named = subtopic ? `${topic} · ${subtopic}` : topic;
  return readyToTeach ? named : `${named} — not ready to teach`;
}

/** What a screen listing classes is showing, and why. */
export type ClassListing =
  | { readonly kind: "today"; readonly heading: string }
  | { readonly kind: "all"; readonly heading: string; readonly because: string };

/**
 * Which classes the front screen lists, and what it calls them.
 *
 * "Today's classes" is only true when the timetable names some, so the other
 * two cases say what they are rather than quietly showing everything under the
 * same heading: a teacher who has set no timetable, and a teacher whose today
 * happens to be free.
 */
export function classListing(
  todaysClasses: readonly string[],
  hasTimetable: boolean,
): ClassListing {
  if (todaysClasses.length > 0) return { kind: "today", heading: "Today's classes" };
  if (!hasTimetable) {
    return {
      kind: "all",
      heading: "Your classes",
      because: "Set your timetable and this becomes the classes you teach today.",
    };
  }
  return {
    kind: "all",
    heading: "Your classes",
    because: "Nothing is timetabled today.",
  };
}
