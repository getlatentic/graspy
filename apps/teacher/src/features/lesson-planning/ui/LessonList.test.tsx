import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { type CurrentTeachingWeek, type WorkspaceLesson } from "../domain/lessonPlanning";
import { LessonList } from "./LessonList";

function lesson(fields: Partial<WorkspaceLesson> & { readonly key: string }): WorkspaceLesson {
  return {
    lessonId: fields.key,
    schemeWeekId: null,
    schemeEntryId: null,
    topic: "Whole Numbers",
    subtopic: null,
    weekOrdinal: null,
    status: "draft",
    startedAt: "2026-07-21 13:53:35",
    ...fields,
  };
}

function showList(
  lessons: readonly WorkspaceLesson[],
  currentWeek: CurrentTeachingWeek | null = null,
) {
  render(
    <LessonList
      lessons={lessons}
      currentWeek={currentWeek}
      selectedLessonId={null}
      planningKey={null}
      onSelect={vi.fn()}
    />,
  );
  return screen.getByRole("navigation", { name: "Lessons in this class and term" });
}

describe("LessonList", () => {
  /// The list carried headings twice over — four bands for when a lesson fell,
  /// and a topic heading inside each. A teacher passed two of them to reach a
  /// lesson, and a topic holding a single lesson had no heading at all, so its
  /// row ran on under whatever group sat above it.
  it("draws one list of lessons, with nothing over them but its own name", () => {
    const list = showList([
      lesson({ key: "a", subtopic: "Millions", weekOrdinal: 1 }),
      lesson({ key: "b", subtopic: "Billions", weekOrdinal: 2 }),
      lesson({ key: "c", topic: "Fractions", subtopic: "Equivalent fractions", weekOrdinal: 3 }),
      lesson({ key: "d", topic: "Rounding to the nearest ten", subtopic: null }),
    ]);

    expect(within(list).getAllByRole("heading")).toHaveLength(1);
    expect(within(list).getByRole("heading", { name: "Every lesson this term" })).toBeVisible();
    expect(within(list).queryByText(/not scheduled/i)).toBeNull();
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  });

  /// Every row says the whole of what it is, because nothing above it does.
  it("says on each row what it covers, its topic and its week", () => {
    const list = showList([
      lesson({ key: "a", subtopic: "Millions", weekOrdinal: 1 }),
      lesson({ key: "b", topic: "Rounding to the nearest ten", subtopic: null }),
    ]);

    expect(
      within(list).getByRole("button", { name: "Millions, Whole Numbers · Week 1, Draft" }),
    ).toBeVisible();
    expect(
      within(list).getByRole("button", { name: "Rounding to the nearest ten, No week yet, Draft" }),
    ).toBeVisible();
  });

  /// The defect this fixes: a lesson called "Equivalent fractions" and a lesson
  /// on Fractions covering equivalent fractions both read "Equivalent
  /// fractions", and nothing on either row said which was which.
  it("tells two lessons sharing a name apart by the topic each sits under", () => {
    const list = showList([
      lesson({ key: "a", topic: "Equivalent fractions", subtopic: null }),
      lesson({ key: "b", topic: "Fractions", subtopic: "Equivalent fractions" }),
    ]);

    expect(
      within(list).getByRole("button", { name: "Equivalent fractions, No week yet, Draft" }),
    ).toBeVisible();
    expect(
      within(list).getByRole("button", {
        name: "Equivalent fractions, Fractions · No week yet, Draft",
      }),
    ).toBeVisible();
  });

  /// The week a teacher is standing in is the one they are looking for, so the
  /// row names it instead of numbering it.
  it("names the running week as this week", () => {
    const list = showList(
      [
        lesson({ key: "a", subtopic: "Millions", weekOrdinal: 2 }),
        lesson({ key: "b", subtopic: "Billions", weekOrdinal: 3 }),
      ],
      { ordinal: 2, standing: "thisWeek" },
    );

    expect(within(list).getByText("Whole Numbers · This week")).toBeVisible();
    expect(within(list).getByText("Whole Numbers · Week 3")).toBeVisible();
  });

  /// The defect this fixes: three drafts of Millions read identically, so a
  /// teacher choosing between them was choosing blind.
  it("tells two drafts of the same subtopic apart by when each was started", () => {
    const list = showList([
      lesson({ key: "a", subtopic: "Millions", startedAt: "2026-07-21 13:53:35" }),
      lesson({ key: "b", subtopic: "Millions", startedAt: "2026-07-21 15:11:51" }),
    ]);

    const started = within(list)
      .getAllByText(/Started /)
      .map((node) => node.textContent);
    expect(started).toHaveLength(2);
    expect(new Set(started).size).toBe(2);
  });

  /// A week the scheme sets is one plan covering all of it, so its row is that
  /// week. Two of them under one topic both read "The whole topic" before this,
  /// separated only by the line beneath.
  it("reads a week the scheme sets as that week, not as its topic", () => {
    const list = showList([
      lesson({ key: "w5", lessonId: null, schemeWeekId: "week-5", topic: "Fractions", subtopic: null, weekOrdinal: 5, status: "unplanned" }),
      lesson({ key: "w6", lessonId: null, schemeWeekId: "week-6", topic: "Fractions", subtopic: null, weekOrdinal: 6, status: "unplanned" }),
    ]);

    expect(within(list).queryByText("The whole topic")).toBeNull();
    expect(within(list).getByRole("button", { name: "Week 5, Fractions, No plan yet" })).toBeVisible();
    expect(within(list).getByRole("button", { name: "Week 6, Fractions, No plan yet" })).toBeVisible();
  });
});
