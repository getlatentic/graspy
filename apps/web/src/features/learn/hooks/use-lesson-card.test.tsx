// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TutorCard } from "@/lib/a2a/reply-data";
import type { LessonTarget } from "../lib/lesson-app";

const opened = vi.hoisted(() => vi.fn());
vi.mock("../lib/lesson-offline", () => ({ openLessonOrCopy: opened }));

const { useLessonCard } = await import("./use-lesson-card");

const TARGET = {
  planId: "plan-1",
  subjectSlug: "real-analysis",
  subject: "Real analysis",
  topicIndex: 1,
  topic: "Sequences",
  totalTopics: 2,
  country: "Nigeria",
  language: "English",
  gradeLevel: "Undergraduate",
} as LessonTarget;
const CARD = { resourceUri: "ui://graspy/lesson" } as TutorCard;

afterEach(() => {
  cleanup();
  opened.mockReset();
});

describe("the lesson a page opens", () => {
  it("is asked for as the chat made it, when the page was opened from the chat", async () => {
    opened.mockResolvedValue(CARD);

    const { result } = renderHook(() => useLessonCard(TARGET, "lesson-9"));

    await act(async () => {});
    expect(result.current.card).toBe(CARD);
    expect(opened).toHaveBeenCalledWith(TARGET, 0, "lesson-9");
  });

  it("is asked for on its own otherwise", async () => {
    opened.mockResolvedValue(CARD);

    const { result } = renderHook(() => useLessonCard(TARGET));

    await act(async () => {});
    expect(result.current.card).toBe(CARD);
    expect(opened).toHaveBeenCalledWith(TARGET, 0, undefined);
  });
});
