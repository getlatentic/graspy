// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonMove } from "@/lib/voice/voice-types";
import type { LessonState } from "../lib/lesson-state";
import { useTeacherLines } from "./use-teacher-lines";

const said: string[] = [];

vi.mock("@/lib/voice/voice-api", () => ({
  teacherAudio: (id: string) => {
    said.push(id);
    return Promise.resolve(new Blob());
  },
  replyAudio: () => Promise.resolve(new Blob()),
}));
vi.mock("@/lib/voice/teacher-voice", () => ({
  TeacherVoice: class {
    async say(line: () => Promise<Blob>) {
      await line();
      return "heard";
    }
    stop() {}
    close() {}
    unlock() {}
  },
}));

afterEach(() => {
  said.length = 0;
});

const rest: LessonMove = { kind: "rest", say: "try-tomorrow" };

describe("the teacher's lines", () => {
  it("speaks the line of a lesson left for tomorrow, not only shows that it is over", async () => {
    const state: LessonState = {
      phase: { name: "rest", move: rest },
      note: null,
    };

    renderHook(() => useTeacherLines(state, () => undefined, "en"));

    await waitFor(() => expect(said).toEqual(["try-tomorrow"]));
  });

  const asked: LessonMove = {
    kind: "event",
    plan_id: "p",
    event_id: "e",
    event: "stimulate_recall",
    say: "p.e",
    say_text: { en: "How many?" },
    activity: { kind: "existing", prompt_id: "q" },
  };

  it("says only that she could not hear after one silent take", async () => {
    const state: LessonState = {
      phase: { name: "your-turn", move: asked },
      note: "noSpeech",
      quiet: 1,
    };

    renderHook(() => useTeacherLines(state, () => undefined, "en"));

    await waitFor(() => expect(said).toEqual(["no-speech"]));
  });

  it("asks the question again after two silent takes in a row", async () => {
    const state: LessonState = {
      phase: { name: "your-turn", move: asked },
      note: "noSpeech",
      quiet: 2,
    };

    renderHook(() => useTeacherLines(state, () => undefined, "en"));

    await waitFor(() => expect(said).toEqual(["no-speech", "p.e"]));
  });
});
