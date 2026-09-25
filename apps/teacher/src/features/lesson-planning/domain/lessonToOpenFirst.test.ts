import { describe, expect, it } from "vitest";

import { lessonToOpenFirst } from "./lessonToOpenFirst";
import type { LessonSummary } from "./lessonPlanning";

function lesson(id: string, weekOrdinal: number | null): LessonSummary {
  return {
    id,
    topic: id,
    subtopic: null,
    status: "draft",
    inputMode: "structured",
    planFormat: "granular",
    latestVersionNumber: 1,
    weekOrdinal,
    schemeEntryId: null, classworkComplete: false,
    startedAt: "2026-07-21 13:53:35",
  };
}

describe("lessonToOpenFirst", () => {
  it("opens nothing when the class has no lessons", () => {
    expect(lessonToOpenFirst([], 3)).toBeNull();
  });

  it("opens this week's lesson rather than the list's first", () => {
    const lessons = [lesson("week-one", 1), lesson("week-three", 3)];
    expect(lessonToOpenFirst(lessons, 3)?.id).toBe("week-three");
  });

  it("falls back to the first lesson when this week has none", () => {
    const lessons = [lesson("week-one", 1), lesson("week-two", 2)];
    expect(lessonToOpenFirst(lessons, 9)?.id).toBe("week-one");
  });

  it("falls back to the first lesson when the term cannot say which week it is", () => {
    const lessons = [lesson("week-one", 1), lesson("week-two", 2)];
    expect(lessonToOpenFirst(lessons, null)?.id).toBe("week-one");
  });

  it("opens a lesson on no week at all when it is the only one", () => {
    expect(lessonToOpenFirst([lesson("unscheduled", null)], 2)?.id).toBe("unscheduled");
  });
});
