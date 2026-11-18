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
// A line is said until `finishLine` is called, when `hold` is on.
const hold = { on: false, release: null as null | (() => void) };
const stopped = { count: 0 };
vi.mock("@/lib/voice/teacher-voice", () => ({
  TeacherVoice: class {
    async say(line: () => Promise<Blob>) {
      await line();
      if (hold.on) await new Promise<void>((done) => (hold.release = done));
      return "heard";
    }
    stop() {
      stopped.count += 1;
    }
    close() {}
    unlock() {}
  },
}));

afterEach(() => {
  said.length = 0;
  hold.on = false;
  hold.release = null;
  stopped.count = 0;
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
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(said).toEqual(["no-speech"]);
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

  const silent = (quiet: number): LessonState => ({
    phase: { name: "your-turn", move: asked },
    note: "noSpeech",
    quiet,
  });
  const noop = vi.fn();

  it("asks again on every silent take from the second, not only the second", async () => {
    renderHook(() => useTeacherLines(silent(3), noop, "en"));

    await waitFor(() => expect(said).toEqual(["no-speech", "p.e"]));
  });

  it("does not ask the question when the child has begun another take while she was still saying she could not hear", async () => {
    hold.on = true;
    const view = renderHook(({ state }) => useTeacherLines(state, noop, "en"), {
      initialProps: { state: silent(2) },
    });
    await waitFor(() => expect(said).toEqual(["no-speech"]));

    view.rerender({
      state: {
        phase: { name: "recording", move: asked },
        note: null,
        quiet: 2,
      },
    });
    hold.release?.();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(said).toEqual(["no-speech"]);
    expect(stopped.count).toBeGreaterThan(0);
  });

  it("says nothing more once the page is left", async () => {
    hold.on = true;
    const view = renderHook(() => useTeacherLines(silent(2), noop, "en"));
    await waitFor(() => expect(said).toEqual(["no-speech"]));

    view.unmount();
    hold.release?.();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(said).toEqual(["no-speech"]);
  });

  it("says nothing again when it renders again with the same state", async () => {
    const state = silent(2);
    const view = renderHook(() => useTeacherLines(state, noop, "en"));
    await waitFor(() => expect(said).toEqual(["no-speech", "p.e"]));

    view.rerender();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(said).toEqual(["no-speech", "p.e"]);
  });
});
