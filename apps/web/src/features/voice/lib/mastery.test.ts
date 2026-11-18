import { describe, expect, it } from "vitest";
import type { CatalogueLesson } from "@/lib/voice/voice-types";
import { MASTERY_DAYS, currentLesson, daysRight } from "./mastery";

const lesson = (patch: Partial<CatalogueLesson>): CatalogueLesson => ({
  plan_id: "a",
  subject: "mathematics",
  topic: "number",
  title: { en: "a" },
  standing: "untouched",
  days_correct: 0,
  current: false,
  ...patch,
});

describe("daysRight", () => {
  it("counts the days right, never past the days needed", () => {
    expect(daysRight(lesson({ days_correct: 1 }))).toBe(1);
    expect(daysRight(lesson({ days_correct: MASTERY_DAYS + 3 }))).toBe(
      MASTERY_DAYS,
    );
  });
});

describe("currentLesson", () => {
  it("is the lesson the server marked, or nothing", () => {
    const marked = lesson({ plan_id: "b", current: true });
    expect(currentLesson([lesson({}), marked])).toBe(marked);
    expect(currentLesson([lesson({})])).toBeUndefined();
  });
});
