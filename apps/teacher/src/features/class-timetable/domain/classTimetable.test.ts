import { describe, expect, it } from "vitest";

import {
  isTaught,
  timetableSummary,
  toggleSlot,
  whatNext,
  whenNext,
  type NextTeachingSlot,
  type TeachingSlot,
} from "./classTimetable";

const monday3: TeachingSlot = { weekday: "monday", period: 3 };

function next(overrides: Partial<NextTeachingSlot> = {}): NextTeachingSlot {
  return {
    teachingAssignmentId: "class-mathematics",
    className: "JSS 1 B",
    subject: "Mathematics",
    weekday: "monday",
    period: 3,
    isToday: false,
    weekOrdinal: 4,
    lesson: {
      lessonId: "lesson",
      topic: "Fractions",
      subtopic: "Equivalent fractions",
      readyToTeach: true,
    },
    ...overrides,
  };
}

describe("the periods a class is taught in", () => {
  it("turns a period on and off again", () => {
    const on = toggleSlot([], "monday", 3);
    expect(on).toEqual([monday3]);
    expect(isTaught(on, "monday", 3)).toBe(true);
    expect(toggleSlot(on, "monday", 3)).toEqual([]);
  });

  it("leaves the other periods alone", () => {
    const both = toggleSlot([monday3], "friday", 1);
    expect(toggleSlot(both, "monday", 3)).toEqual([{ weekday: "friday", period: 1 }]);
  });

  /// "0 periods a week" reads as a fact about the class rather than about what
  /// the app has been told.
  it("says nothing is set rather than counting to nothing", () => {
    expect(timetableSummary([])).toBe("No periods set");
    expect(timetableSummary([monday3])).toBe("1 period a week");
    expect(timetableSummary([monday3, { weekday: "friday", period: 1 }])).toBe(
      "2 periods a week",
    );
  });
});

describe("what a teacher teaches next", () => {
  it("says today when it is today, and names the day when it is not", () => {
    expect(whenNext(next({ isToday: true }))).toBe("Today · Period 3");
    expect(whenNext(next({ weekday: "thursday", period: 1 }))).toBe("Thursday · Period 1");
  });

  it("names the lesson the week's plan holds", () => {
    expect(whatNext(next())).toBe("Fractions · Equivalent fractions");
  });

  /// A lesson that is confirmed but has no classwork is not one to walk into a
  /// room with, and saying only its name would suggest otherwise.
  it("says when the lesson is not ready to teach", () => {
    expect(whatNext(next({ lesson: { ...next().lesson!, readyToTeach: false } }))).toBe(
      "Fractions · Equivalent fractions — not ready to teach",
    );
  });

  it("says what is missing rather than naming a lesson that does not exist", () => {
    expect(whatNext(next({ lesson: null }))).toBe("No lesson planned for this week yet");
  });
});
