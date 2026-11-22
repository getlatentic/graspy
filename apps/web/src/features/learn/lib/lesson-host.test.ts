import { describe, expect, it, vi } from "vitest";
import { haptics } from "@/features/haptics/lib/haptics";
import type { TutorCard } from "@/lib/a2a/reply-data";
import { lessonHost } from "./lesson-host";
import type { LessonTarget } from "./lesson-app";

function host() {
  const marks = { learnt: vi.fn(), ready: vi.fn() };
  const onFinish = vi.fn();
  const view = lessonHost({
    target: {} as LessonTarget,
    card: {} as TutorCard,
    marks,
    onFinish,
    onObjectives: vi.fn(),
  });
  return { view, marks, onFinish };
}

const check = (over: Record<string, unknown> = {}) => ({
  key: "view-1:2",
  chosenIndex: 1,
  answerIndex: 1,
  tried: [],
  ...over,
});

describe("a lesson's haptics", () => {
  it("feels a check as the tap arrives, graded by the view's own answer", () => {
    const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
    const { view } = host();
    view.toolCalling?.("answer_check", check({ key: "a:0" }));
    expect(trigger).toHaveBeenCalledWith("correct");
    view.toolCalling?.(
      "answer_check",
      check({ key: "a:1", chosenIndex: 0, tried: [] }),
    );
    expect(trigger).toHaveBeenLastCalledWith("wrong");
  });

  it("does not feel a choice the view sends again", () => {
    const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
    const { view } = host();
    const again = check({ key: "b:0" });
    view.toolCalling?.("answer_check", again);
    view.toolCalling?.("answer_check", { ...again });
    expect(trigger).toHaveBeenCalledOnce();
  });

  it("feels nothing for another tool", () => {
    const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
    host().view.toolCalling?.("give_lesson", check({ key: "c:0" }));
    expect(trigger).not.toHaveBeenCalled();
  });

  it("feels the lesson finish, once it is recorded", () => {
    const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
    const { view, marks, onFinish } = host();
    view.toolCalled("finish_lesson", {}, { content: [] });
    expect(trigger).toHaveBeenCalledWith("lessonComplete");
    expect(marks.learnt).toHaveBeenCalledOnce();
    expect(onFinish).toHaveBeenCalledOnce();
  });
});
